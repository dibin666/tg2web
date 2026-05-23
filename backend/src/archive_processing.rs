use crate::{
    error::{AppError, AppResult},
    models::MAX_ARCHIVE_FOLDER_TEMPLATE_LEN,
};
use regex::Regex;
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const DEFAULT_SOURCE: &str = "WEB";
const DEFAULT_FORMAT: &str = "FLAC";
const DEFAULT_BIT_DEPTH: &str = "16";
const DEFAULT_SAMPLE_RATE: &str = "44.1";
const MAX_FOLDER_NAME_CHARS: usize = 180;

#[derive(Debug, Clone)]
pub struct ArchiveProcessingSettings {
    pub enabled: bool,
    pub template: String,
}

#[derive(Debug, Clone)]
pub struct ArchiveProcessingRequest {
    pub cache_path: PathBuf,
    pub workspace_root: PathBuf,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
    pub message_text: Option<String>,
    pub settings: ArchiveProcessingSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArchiveFormat {
    Zip,
    SevenZ,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ArchiveNamingContext {
    artist: Option<String>,
    album: Option<String>,
    year: Option<String>,
    provider: Option<String>,
    source: Option<String>,
    format: Option<String>,
    bit_depth: Option<String>,
    sample_rate: Option<String>,
    quality: Option<String>,
}

impl ArchiveNamingContext {
    fn value(&self, key: &str) -> String {
        match key {
            "artist" => self.artist.as_deref().unwrap_or("Unknown Artist"),
            "album" => self.album.as_deref().unwrap_or("Unknown Album"),
            "year" => self.year.as_deref().unwrap_or("0000"),
            "provider" => self.provider.as_deref().unwrap_or(""),
            "source" => self.source.as_deref().unwrap_or(DEFAULT_SOURCE),
            "format" => self.format.as_deref().unwrap_or(DEFAULT_FORMAT),
            "bitDepth" => self.bit_depth.as_deref().unwrap_or(DEFAULT_BIT_DEPTH),
            "sampleRate" => self.sample_rate.as_deref().unwrap_or(DEFAULT_SAMPLE_RATE),
            "quality" => self.quality.as_deref().unwrap_or("16B-44.1kHz"),
            _ => "",
        }
        .to_string()
    }
}

pub async fn maybe_process_archive(request: ArchiveProcessingRequest) -> AppResult<bool> {
    if !request.settings.enabled {
        return Ok(false);
    }
    if archive_format(request.file_name.as_deref(), request.mime_type.as_deref()).is_none() {
        return Ok(false);
    }

    tokio::task::spawn_blocking(move || process_archive_blocking(request))
        .await
        .map_err(|error| {
            AppError::upstream_unavailable(
                "archive_processing_failed",
                format!("archive processing task failed: {error}"),
            )
        })?
        .map_err(|error| AppError::bad_request("archive_processing_failed", error))
}

fn process_archive_blocking(request: ArchiveProcessingRequest) -> Result<bool, String> {
    let Some(format) = archive_format_from_magic(&request.cache_path)? else {
        return Ok(false);
    };

    let workspace = request
        .workspace_root
        .join(".archive-processing")
        .join(format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| format!("system clock before UNIX epoch: {error}"))?
                .as_nanos()
        ));
    let result = process_archive_in_workspace(&request, format, &workspace);
    let _ = fs::remove_dir_all(&workspace);
    result.map(|_| true)
}

fn process_archive_in_workspace(
    request: &ArchiveProcessingRequest,
    format: ArchiveFormat,
    workspace: &Path,
) -> Result<(), String> {
    let extract_dir = workspace.join("extract");
    fs::create_dir_all(&extract_dir).map_err(|error| {
        format!(
            "failed to create archive processing workspace {}: {error}",
            extract_dir.display()
        )
    })?;

    match format {
        ArchiveFormat::Zip => extract_zip_archive(&request.cache_path, &extract_dir)?,
        ArchiveFormat::SevenZ => {
            sevenz_rust2::decompress_file(&request.cache_path, &extract_dir)
                .map_err(|error| format!("failed to extract 7z archive: {error}"))?
        }
    }

    let mut context = parse_message_metadata(request.message_text.as_deref());
    enrich_context_from_extracted_files(&extract_dir, &mut context)?;

    let rendered = render_template(&request.settings.template, &context);
    let folder_name = sanitize_folder_name(&rendered);
    let top_level = normalize_top_level_folder(&extract_dir, &folder_name)?;
    let output_path = workspace.join(match format {
        ArchiveFormat::Zip => "repacked.zip",
        ArchiveFormat::SevenZ => "repacked.7z",
    });

    match format {
        ArchiveFormat::Zip => create_zip_archive(&top_level, &output_path)?,
        ArchiveFormat::SevenZ => sevenz_rust2::compress_to_path(&top_level, &output_path)
            .map_err(|error| format!("failed to create 7z archive: {error}"))?,
    }

    fs::rename(&output_path, &request.cache_path).map_err(|error| {
        format!(
            "failed to replace cached archive {}: {error}",
            request.cache_path.display()
        )
    })?;
    Ok(())
}

fn archive_format(file_name: Option<&str>, mime_type: Option<&str>) -> Option<ArchiveFormat> {
    let name = file_name.unwrap_or_default().to_ascii_lowercase();
    let mime = mime_type.unwrap_or_default().to_ascii_lowercase();

    if name.ends_with(".zip")
        || mime == "application/zip"
        || mime == "application/x-zip-compressed"
        || mime.contains("zip")
    {
        return Some(ArchiveFormat::Zip);
    }

    if name.ends_with(".7z") || mime == "application/x-7z-compressed" || mime.contains("7z") {
        return Some(ArchiveFormat::SevenZ);
    }

    None
}

fn archive_format_from_magic(path: &Path) -> Result<Option<ArchiveFormat>, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("failed to open cached file {}: {error}", path.display()))?;
    let mut header = [0_u8; 6];
    let bytes_read = file
        .read(&mut header)
        .map_err(|error| format!("failed to read cached file {}: {error}", path.display()))?;
    if bytes_read >= 4
        && (&header[..4] == b"PK\x03\x04"
            || &header[..4] == b"PK\x05\x06"
            || &header[..4] == b"PK\x07\x08")
    {
        return Ok(Some(ArchiveFormat::Zip));
    }
    if bytes_read >= 6 && header == [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        return Ok(Some(ArchiveFormat::SevenZ));
    }
    Ok(None)
}

fn parse_message_metadata(text: Option<&str>) -> ArchiveNamingContext {
    let mut context = ArchiveNamingContext {
        source: Some(DEFAULT_SOURCE.to_string()),
        ..ArchiveNamingContext::default()
    };
    let Some(text) = text else {
        return context;
    };

    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_uppercase();
        let value = clean_metadata_value(value);
        if value.is_empty() {
            continue;
        }

        match key.as_str() {
            "TITLE" | "NAME" => {
                if context.album.is_none() {
                    context.album = Some(value);
                }
            }
            "ARTIST" => context.artist = Some(value),
            "RELEASE DATE" | "RELEASE_DATE" | "DATE" | "YEAR" => {
                context.year = extract_year(&value).or(Some(value));
            }
            "PROVIDER" => context.provider = Some(value),
            "QUALITY" => {
                apply_quality(&value, &mut context);
            }
            _ => {}
        }
    }

    context
}

fn clean_metadata_value(value: &str) -> String {
    value
        .trim()
        .trim_matches(|ch| ch == '`' || ch == '*')
        .trim()
        .to_string()
}

fn apply_quality(value: &str, context: &mut ArchiveNamingContext) {
    if let Some((bit_depth, sample_rate)) = parse_quality(value) {
        context.bit_depth = Some(bit_depth.clone());
        context.sample_rate = Some(sample_rate.clone());
        context.quality = Some(format!("{bit_depth}B-{sample_rate}kHz"));
    } else if context.quality.is_none() {
        context.quality = Some(value.trim().to_string());
    }
}

fn parse_quality(value: &str) -> Option<(String, String)> {
    let captures = quality_regex().captures(value)?;
    let bit_depth = captures.get(1)?.as_str().to_string();
    let sample_rate = normalize_sample_rate(captures.get(2)?.as_str());
    Some((bit_depth, sample_rate))
}

fn quality_regex() -> &'static Regex {
    static QUALITY_REGEX: OnceLock<Regex> = OnceLock::new();
    QUALITY_REGEX.get_or_init(|| {
        Regex::new(r"(?i)(\d{1,2})\s*(?:B|BIT)\s*[-/ ]+\s*([0-9]+(?:\.[0-9]+)?)\s*K(?:HZ)?")
            .expect("quality regex is valid")
    })
}

fn extract_year(value: &str) -> Option<String> {
    year_regex()
        .find(value)
        .map(|matched| matched.as_str().to_string())
}

fn year_regex() -> &'static Regex {
    static YEAR_REGEX: OnceLock<Regex> = OnceLock::new();
    YEAR_REGEX.get_or_init(|| Regex::new(r"\b(19|20)\d{2}\b").expect("year regex is valid"))
}

fn render_template(template: &str, context: &ArchiveNamingContext) -> String {
    let mut rendered = template.trim().to_string();
    for key in [
        "artist",
        "album",
        "year",
        "provider",
        "source",
        "format",
        "bitDepth",
        "sampleRate",
        "quality",
    ] {
        rendered = rendered.replace(&format!("{{{key}}}"), &context.value(key));
    }
    placeholder_regex().replace_all(&rendered, "").to_string()
}

fn placeholder_regex() -> &'static Regex {
    static PLACEHOLDER_REGEX: OnceLock<Regex> = OnceLock::new();
    PLACEHOLDER_REGEX.get_or_init(|| {
        Regex::new(r"\{[A-Za-z][A-Za-z0-9_]*\}").expect("placeholder regex is valid")
    })
}

fn sanitize_folder_name(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut previous_was_space = false;
    for ch in value.chars() {
        let next = if ch.is_control()
            || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        {
            '-'
        } else {
            ch
        };
        if next.is_whitespace() {
            if !previous_was_space {
                sanitized.push(' ');
            }
            previous_was_space = true;
        } else {
            sanitized.push(next);
            previous_was_space = false;
        }
    }

    let sanitized = sanitized
        .trim()
        .trim_matches('.')
        .chars()
        .take(MAX_FOLDER_NAME_CHARS)
        .collect::<String>();

    let sanitized = sanitized.replace("..", ".");
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        "Untitled Album".to_string()
    } else {
        sanitized
    }
}

pub fn validate_archive_folder_template(template: &str) -> Result<String, &'static str> {
    let template = template.trim();
    if template.is_empty() {
        return Err("archiveFolderTemplate must not be empty");
    }
    if template.len() > MAX_ARCHIVE_FOLDER_TEMPLATE_LEN {
        return Err("archiveFolderTemplate is too long");
    }
    Ok(template.to_string())
}

fn enrich_context_from_extracted_files(
    root: &Path,
    context: &mut ArchiveNamingContext,
) -> Result<(), String> {
    if let Some(flac_path) = find_first_file_with_extension(root, "flac")? {
        if context.format.is_none() {
            context.format = Some("FLAC".to_string());
        }
        if context.bit_depth.is_none()
            || context.sample_rate.is_none()
            || context.artist.is_none()
            || context.album.is_none()
            || context.year.is_none()
        {
            apply_metaflac_metadata(&flac_path, context)?;
        }
        return Ok(());
    }

    if context.format.is_none() {
        if let Some(extension) = find_first_audio_extension(root)? {
            context.format = Some(extension.to_ascii_uppercase());
        }
    }
    Ok(())
}

fn apply_metaflac_metadata(
    flac_path: &Path,
    context: &mut ArchiveNamingContext,
) -> Result<(), String> {
    let output = Command::new("metaflac")
        .arg("--show-sample-rate")
        .arg("--show-bps")
        .arg("--show-tag=ARTIST")
        .arg("--show-tag=ALBUM")
        .arg("--show-tag=DATE")
        .arg(flac_path)
        .output()
        .map_err(|error| format!("failed to run metaflac: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "metaflac failed for {}: {}",
            flac_path.display(),
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut stream_values = stdout
        .lines()
        .filter(|line| !line.contains('='))
        .map(str::trim)
        .filter(|line| !line.is_empty());

    if context.sample_rate.is_none() {
        if let Some(sample_rate_hz) = stream_values.next() {
            context.sample_rate = Some(normalize_sample_rate_from_hz(sample_rate_hz));
        }
    } else {
        let _ = stream_values.next();
    }

    if context.bit_depth.is_none() {
        if let Some(bit_depth) = stream_values.next() {
            context.bit_depth = Some(bit_depth.to_string());
        }
    }

    for line in stdout.lines().filter(|line| line.contains('=')) {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = clean_metadata_value(value);
        if value.is_empty() {
            continue;
        }
        match key.to_ascii_uppercase().as_str() {
            "ARTIST" if context.artist.is_none() => context.artist = Some(value),
            "ALBUM" if context.album.is_none() => context.album = Some(value),
            "DATE" if context.year.is_none() => {
                context.year = extract_year(&value).or(Some(value));
            }
            _ => {}
        }
    }

    if let (Some(bit_depth), Some(sample_rate)) =
        (context.bit_depth.as_deref(), context.sample_rate.as_deref())
    {
        context.quality = Some(format!("{bit_depth}B-{sample_rate}kHz"));
    }

    Ok(())
}

fn normalize_sample_rate(value: &str) -> String {
    let trimmed = value.trim();
    let Ok(khz) = trimmed.parse::<f64>() else {
        return trimmed.to_string();
    };
    format_sample_rate_khz(khz).unwrap_or_else(|| trimmed.to_string())
}

fn normalize_sample_rate_from_hz(value: &str) -> String {
    let trimmed = value.trim();
    let Ok(hz) = trimmed.parse::<f64>() else {
        return normalize_sample_rate(trimmed);
    };
    let khz = if hz >= 1000.0 { hz / 1000.0 } else { hz };
    format_sample_rate_khz(khz).unwrap_or_else(|| trimmed.to_string())
}

fn format_sample_rate_khz(value: f64) -> Option<String> {
    if !value.is_finite() {
        return None;
    }
    Some(format!("{:.1}", (value * 10.0).round() / 10.0))
}

fn find_first_file_with_extension(root: &Path, extension: &str) -> Result<Option<PathBuf>, String> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        for entry in fs::read_dir(&path)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?
        {
            let entry =
                entry.map_err(|error| format!("failed to read directory entry: {error}"))?;
            let path = entry.path();
            let metadata = entry
                .metadata()
                .map_err(|error| format!("failed to read {} metadata: {error}", path.display()))?;
            if metadata.is_dir() {
                stack.push(path);
            } else if path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case(extension))
            {
                return Ok(Some(path));
            }
        }
    }
    Ok(None)
}

fn find_first_audio_extension(root: &Path) -> Result<Option<String>, String> {
    for extension in ["flac", "wav", "m4a", "mp3", "aac", "ogg", "opus"] {
        if find_first_file_with_extension(root, extension)?.is_some() {
            return Ok(Some(extension.to_string()));
        }
    }
    Ok(None)
}

fn extract_zip_archive(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|error| {
        format!(
            "failed to open ZIP archive {}: {error}",
            archive_path.display()
        )
    })?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("failed to read ZIP archive: {error}"))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to read ZIP entry #{index}: {error}"))?;
        if entry.is_symlink() {
            return Err(format!(
                "ZIP symlink entries are not supported: {}",
                entry.name()
            ));
        }
        let enclosed_name = entry
            .enclosed_name()
            .ok_or_else(|| format!("ZIP entry has an unsafe path: {}", entry.name()))?;
        let output_path = destination.join(enclosed_name);
        if entry.is_dir() {
            fs::create_dir_all(&output_path).map_err(|error| {
                format!(
                    "failed to create directory {}: {error}",
                    output_path.display()
                )
            })?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("failed to create directory {}: {error}", parent.display())
                })?;
            }
            let mut output = File::create(&output_path).map_err(|error| {
                format!("failed to create file {}: {error}", output_path.display())
            })?;
            io::copy(&mut entry, &mut output)
                .map_err(|error| format!("failed to extract {}: {error}", output_path.display()))?;
        }
    }
    Ok(())
}

fn normalize_top_level_folder(extract_dir: &Path, folder_name: &str) -> Result<PathBuf, String> {
    let mut entries = fs::read_dir(extract_dir)
        .map_err(|error| format!("failed to read extracted archive root: {error}"))?
        .map(|entry| {
            entry
                .map(|entry| entry.path())
                .map_err(|error| format!("failed to read extracted archive entry: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    entries.sort();

    if entries.is_empty() {
        return Err("archive contained no files".to_string());
    }

    let target_dir = extract_dir.join(folder_name);
    if entries.len() == 1 && entries[0].is_dir() {
        if entries[0] == target_dir {
            return Ok(target_dir);
        }
        fs::rename(&entries[0], &target_dir).map_err(|error| {
            format!(
                "failed to rename top-level folder {} to {}: {error}",
                entries[0].display(),
                target_dir.display()
            )
        })?;
        return Ok(target_dir);
    }

    fs::create_dir_all(&target_dir).map_err(|error| {
        format!(
            "failed to create target folder {}: {error}",
            target_dir.display()
        )
    })?;

    for entry in entries {
        if entry == target_dir {
            continue;
        }
        let Some(file_name) = entry.file_name() else {
            return Err(format!(
                "extracted path has no filename: {}",
                entry.display()
            ));
        };
        let destination = target_dir.join(file_name);
        if destination.exists() {
            return Err(format!(
                "cannot move {} into target folder because {} already exists",
                entry.display(),
                destination.display()
            ));
        }
        fs::rename(&entry, &destination).map_err(|error| {
            format!(
                "failed to move {} into {}: {error}",
                entry.display(),
                destination.display()
            )
        })?;
    }

    Ok(target_dir)
}

fn create_zip_archive(source_dir: &Path, output_path: &Path) -> Result<(), String> {
    let file = File::create(output_path).map_err(|error| {
        format!(
            "failed to create ZIP archive {}: {error}",
            output_path.display()
        )
    })?;
    let mut writer = ZipWriter::new(file);
    let base_dir = source_dir
        .parent()
        .ok_or_else(|| format!("source path has no parent: {}", source_dir.display()))?;
    add_path_to_zip(&mut writer, base_dir, source_dir)?;
    writer
        .finish()
        .map_err(|error| format!("failed to finish ZIP archive: {error}"))?;
    Ok(())
}

fn add_path_to_zip(
    writer: &mut ZipWriter<File>,
    base_dir: &Path,
    path: &Path,
) -> Result<(), String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("failed to read {} metadata: {error}", path.display()))?;
    let archive_name = archive_relative_name(base_dir, path)?;
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    if metadata.is_dir() {
        writer
            .add_directory(format!("{archive_name}/"), options)
            .map_err(|error| format!("failed to add ZIP directory {archive_name}: {error}"))?;
        let mut children = fs::read_dir(path)
            .map_err(|error| format!("failed to read directory {}: {error}", path.display()))?
            .map(|entry| {
                entry
                    .map(|entry| entry.path())
                    .map_err(|error| format!("failed to read directory entry: {error}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        children.sort();
        for child in children {
            add_path_to_zip(writer, base_dir, &child)?;
        }
    } else {
        writer
            .start_file(&archive_name, options)
            .map_err(|error| format!("failed to add ZIP file {archive_name}: {error}"))?;
        let mut input = File::open(path)
            .map_err(|error| format!("failed to open {}: {error}", path.display()))?;
        let mut buffer = Vec::new();
        input
            .read_to_end(&mut buffer)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
        writer
            .write_all(&buffer)
            .map_err(|error| format!("failed to write ZIP file {archive_name}: {error}"))?;
    }

    Ok(())
}

fn archive_relative_name(base_dir: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(base_dir).map_err(|error| {
        format!(
            "failed to make {} relative to {}: {error}",
            path.display(),
            base_dir.display()
        )
    })?;
    Ok(relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parses_bot_message_metadata() {
        let context = parse_message_metadata(Some(
            "TITLE : FUTURE SESSION/ONENESS HARMONY\nARTIST : Orchestre\nRELEASE DATE : 2025-11-12\nQUALITY : 16B - 44.1k\nPROVIDER : Qobuz",
        ));

        assert_eq!(
            context.album.as_deref(),
            Some("FUTURE SESSION/ONENESS HARMONY")
        );
        assert_eq!(context.artist.as_deref(), Some("Orchestre"));
        assert_eq!(context.year.as_deref(), Some("2025"));
        assert_eq!(context.bit_depth.as_deref(), Some("16"));
        assert_eq!(context.sample_rate.as_deref(), Some("44.1"));
        assert_eq!(context.quality.as_deref(), Some("16B-44.1kHz"));
    }

    #[test]
    fn parses_whole_number_sample_rate_with_one_decimal() {
        let context = parse_message_metadata(Some("QUALITY : 24B - 96k"));

        assert_eq!(context.bit_depth.as_deref(), Some("24"));
        assert_eq!(context.sample_rate.as_deref(), Some("96.0"));
        assert_eq!(context.quality.as_deref(), Some("24B-96.0kHz"));
        assert_eq!(normalize_sample_rate_from_hz("48000"), "48.0");
        assert_eq!(normalize_sample_rate_from_hz("44100"), "44.1");
    }

    #[test]
    fn renders_and_sanitizes_folder_template() {
        let context = ArchiveNamingContext {
            artist: Some("Artist/Name".to_string()),
            album: Some("Album:Name".to_string()),
            year: Some("2025".to_string()),
            format: Some("FLAC".to_string()),
            bit_depth: Some("24".to_string()),
            sample_rate: Some("96.0".to_string()),
            ..ArchiveNamingContext::default()
        };
        let rendered = render_template(
            "{artist} - {album} ({year}) [WEB][{format} {bitDepth}B-{sampleRate}kHz]",
            &context,
        );
        assert_eq!(
            sanitize_folder_name(&rendered),
            "Artist-Name - Album-Name (2025) [WEB][FLAC 24B-96.0kHz]"
        );
    }

    #[test]
    fn zip_round_trip_renames_top_level_folder() {
        let dir = tempdir().expect("tempdir");
        let source_root = dir.path().join("original");
        fs::create_dir_all(&source_root).expect("source root");
        fs::write(source_root.join("track.flac"), b"not really flac").expect("write track");
        let input_zip = dir.path().join("input.zip");
        create_zip_archive(&source_root, &input_zip).expect("zip input");

        let cache_path = dir.path().join("cache.bin");
        fs::copy(&input_zip, &cache_path).expect("seed cache");
        let request = ArchiveProcessingRequest {
            cache_path: cache_path.clone(),
            workspace_root: dir.path().to_path_buf(),
            file_name: Some("album.zip".to_string()),
            mime_type: Some("application/zip".to_string()),
            message_text: Some(
                "TITLE : Album\nARTIST : Artist\nRELEASE DATE : 2025-01-01\nQUALITY : 16B - 44.1k"
                    .to_string(),
            ),
            settings: ArchiveProcessingSettings {
                enabled: true,
                template: "{artist} - {album} ({year}) [WEB][{quality}]".to_string(),
            },
        };

        process_archive_blocking(request).expect("process archive");

        let output = File::open(cache_path).expect("open output");
        let mut archive = ZipArchive::new(output).expect("read output zip");
        let mut names = (0..archive.len())
            .map(|index| archive.by_index(index).expect("entry").name().to_string())
            .collect::<Vec<_>>();
        names.sort();
        assert!(names
            .iter()
            .any(|name| name == "Artist - Album (2025) [WEB][16B-44.1kHz]/track.flac"));
    }
}
