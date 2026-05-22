use crate::{
    error::{AppError, AppResult},
    models::{QobuzAlbumSearchItem, QobuzAlbumSearchResponse, QobuzStoreRegion},
};
use regex::Regex;
use reqwest::{
    header::{ACCEPT, ACCEPT_LANGUAGE},
    StatusCode, Url,
};
use scraper::{ElementRef, Html, Selector};
use std::{collections::HashMap, sync::OnceLock, time::Duration};

const QOBUZ_BASE_URL: &str = "https://www.qobuz.com";
const DEFAULT_QOBUZ_REGION: &str = "jp-ja";
const QOBUZ_SEARCH_PAGE_SIZE: u32 = 60;

#[derive(Debug, Clone, Copy)]
struct QobuzStoreRegionSpec {
    code: &'static str,
    country: &'static str,
    language: &'static str,
    label: &'static str,
    accept_language: &'static str,
}

const QOBUZ_STORE_REGIONS: &[QobuzStoreRegionSpec] = &[
    QobuzStoreRegionSpec {
        code: "ar-es",
        country: "Argentina",
        language: "Spanish",
        label: "Argentina",
        accept_language: "es-AR,es;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "au-en",
        country: "Australia",
        language: "English",
        label: "Australia",
        accept_language: "en-AU,en;q=0.9",
    },
    QobuzStoreRegionSpec {
        code: "at-de",
        country: "Austria",
        language: "German",
        label: "Austria",
        accept_language: "de-AT,de;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "be-fr",
        country: "Belgium",
        language: "French",
        label: "Belgium - French",
        accept_language: "fr-BE,fr;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "be-nl",
        country: "Belgium",
        language: "Dutch",
        label: "Belgium - Dutch",
        accept_language: "nl-BE,nl;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "br-pt",
        country: "Brazil",
        language: "Portuguese",
        label: "Brazil",
        accept_language: "pt-BR,pt;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "ca-en",
        country: "Canada",
        language: "English",
        label: "Canada - English",
        accept_language: "en-CA,en;q=0.9,fr;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "ca-fr",
        country: "Canada",
        language: "French",
        label: "Canada - French",
        accept_language: "fr-CA,fr;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "cl-es",
        country: "Chile",
        language: "Spanish",
        label: "Chile",
        accept_language: "es-CL,es;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "co-es",
        country: "Colombia",
        language: "Spanish",
        label: "Colombia",
        accept_language: "es-CO,es;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "dk-en",
        country: "Denmark",
        language: "English",
        label: "Denmark",
        accept_language: "en-DK,en;q=0.9,da;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "fi-en",
        country: "Finland",
        language: "English",
        label: "Finland",
        accept_language: "en-FI,en;q=0.9,fi;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "fr-fr",
        country: "France",
        language: "French",
        label: "France",
        accept_language: "fr-FR,fr;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "de-de",
        country: "Germany",
        language: "German",
        label: "Germany",
        accept_language: "de-DE,de;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "ie-en",
        country: "Ireland",
        language: "English",
        label: "Ireland",
        accept_language: "en-IE,en;q=0.9",
    },
    QobuzStoreRegionSpec {
        code: "it-it",
        country: "Italy",
        language: "Italian",
        label: "Italy",
        accept_language: "it-IT,it;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "jp-ja",
        country: "Japan",
        language: "Japanese",
        label: "Japan",
        accept_language: "ja-JP,ja;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "lu-de",
        country: "Luxembourg",
        language: "German",
        label: "Luxembourg - German",
        accept_language: "de-LU,de;q=0.9,fr;q=0.8,en;q=0.7",
    },
    QobuzStoreRegionSpec {
        code: "lu-fr",
        country: "Luxembourg",
        language: "French",
        label: "Luxembourg - French",
        accept_language: "fr-LU,fr;q=0.9,de;q=0.8,en;q=0.7",
    },
    QobuzStoreRegionSpec {
        code: "mx-es",
        country: "Mexico",
        language: "Spanish",
        label: "Mexico",
        accept_language: "es-MX,es;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "nl-nl",
        country: "Netherlands",
        language: "Dutch",
        label: "Netherlands",
        accept_language: "nl-NL,nl;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "nz-en",
        country: "New Zealand",
        language: "English",
        label: "New Zealand",
        accept_language: "en-NZ,en;q=0.9",
    },
    QobuzStoreRegionSpec {
        code: "no-en",
        country: "Norway",
        language: "English",
        label: "Norway",
        accept_language: "en-NO,en;q=0.9,no;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "pt-pt",
        country: "Portugal",
        language: "Portuguese",
        label: "Portugal",
        accept_language: "pt-PT,pt;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "es-es",
        country: "Spain",
        language: "Spanish",
        label: "Spain",
        accept_language: "es-ES,es;q=0.9,en;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "se-en",
        country: "Sweden",
        language: "English",
        label: "Sweden",
        accept_language: "en-SE,en;q=0.9,sv;q=0.8",
    },
    QobuzStoreRegionSpec {
        code: "ch-de",
        country: "Switzerland",
        language: "German",
        label: "Switzerland - German",
        accept_language: "de-CH,de;q=0.9,fr;q=0.8,en;q=0.7",
    },
    QobuzStoreRegionSpec {
        code: "ch-fr",
        country: "Switzerland",
        language: "French",
        label: "Switzerland - French",
        accept_language: "fr-CH,fr;q=0.9,de;q=0.8,en;q=0.7",
    },
    QobuzStoreRegionSpec {
        code: "gb-en",
        country: "United Kingdom",
        language: "English",
        label: "United Kingdom",
        accept_language: "en-GB,en;q=0.9",
    },
    QobuzStoreRegionSpec {
        code: "us-en",
        country: "United States",
        language: "English",
        label: "United States",
        accept_language: "en-US,en;q=0.9",
    },
];

#[derive(Debug, Clone)]
pub struct QobuzShopClient {
    http: reqwest::Client,
}

#[derive(Debug, Default)]
struct AlbumAccumulator {
    id: String,
    title: Option<String>,
    artist: Option<String>,
    album_url: String,
    cover_url: Option<String>,
    price: Option<String>,
    currency: Option<String>,
    release_date_display: Option<String>,
    genre: Option<String>,
    track_count: Option<u32>,
    quality: Option<String>,
}

impl QobuzShopClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::limited(5))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                 AppleWebKit/537.36 (KHTML, like Gecko) \
                 Chrome/125.0.0.0 Safari/537.36",
            )
            .build()
            .expect("qobuz HTTP client configuration is valid");

        Self { http }
    }

    pub async fn search_albums(
        &self,
        region_code: Option<&str>,
        query: &str,
        page: Option<u32>,
    ) -> AppResult<QobuzAlbumSearchResponse> {
        let region = region_from_request(region_code)?;
        let query = normalize_query(query)?;
        let page = normalize_page(page)?;
        let source_url = album_search_url(region.code, query, page)?;
        let response = self
            .http
            .get(&source_url)
            .header(
                ACCEPT,
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header(ACCEPT_LANGUAGE, region.accept_language)
            .send()
            .await
            .map_err(|error| {
                AppError::upstream_unavailable(
                    "qobuz_unavailable",
                    format!("qobuz search request failed: {error}"),
                )
            })?;

        let status = response.status();
        if !status.is_success() {
            return Err(qobuz_status_error(status));
        }

        let html = response.text().await.map_err(|error| {
            AppError::upstream_unavailable(
                "qobuz_unavailable",
                format!("qobuz search response could not be read: {error}"),
            )
        })?;

        Ok(parse_album_search_html(
            region,
            query,
            page,
            &source_url,
            &html,
        ))
    }
}

pub fn qobuz_store_regions() -> Vec<QobuzStoreRegion> {
    QOBUZ_STORE_REGIONS
        .iter()
        .map(|region| region.to_model())
        .collect()
}

pub fn album_search_url(region_code: &str, query: &str, page: u32) -> AppResult<String> {
    let region = region_by_code(region_code).ok_or_else(|| {
        AppError::bad_request(
            "invalid_qobuz_region",
            format!("unsupported qobuz store region: {region_code}"),
        )
    })?;
    let query = normalize_query(query)?;
    let page = normalize_page(Some(page))?;
    let encoded_query = urlencoding::encode(query);
    let page_part = if page == 1 {
        String::new()
    } else {
        format!("/page/{page}")
    };

    Ok(format!(
        "{QOBUZ_BASE_URL}/{}/search/albums/{encoded_query}{page_part}?mode=grid",
        region.code
    ))
}

impl QobuzStoreRegionSpec {
    fn to_model(self) -> QobuzStoreRegion {
        QobuzStoreRegion {
            code: self.code.to_string(),
            country: self.country.to_string(),
            language: self.language.to_string(),
            label: self.label.to_string(),
        }
    }
}

fn region_from_request(region_code: Option<&str>) -> AppResult<QobuzStoreRegionSpec> {
    let code = region_code
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_QOBUZ_REGION);

    region_by_code(code).ok_or_else(|| {
        AppError::bad_request(
            "invalid_qobuz_region",
            format!("unsupported qobuz store region: {code}"),
        )
    })
}

fn region_by_code(region_code: &str) -> Option<QobuzStoreRegionSpec> {
    QOBUZ_STORE_REGIONS
        .iter()
        .copied()
        .find(|region| region.code.eq_ignore_ascii_case(region_code.trim()))
}

fn normalize_query(query: &str) -> AppResult<&str> {
    let query = query.trim();
    if query.is_empty() {
        return Err(AppError::bad_request(
            "missing_qobuz_query",
            "qobuz search query is required",
        ));
    }

    Ok(query)
}

fn normalize_page(page: Option<u32>) -> AppResult<u32> {
    let page = page.unwrap_or(1);
    if page == 0 {
        return Err(AppError::bad_request(
            "invalid_qobuz_page",
            "qobuz search page must be at least 1",
        ));
    }

    Ok(page)
}

fn qobuz_status_error(status: StatusCode) -> AppError {
    AppError::upstream_unavailable(
        "qobuz_unavailable",
        format!("qobuz search request returned {status}"),
    )
}

fn parse_album_search_html(
    region: QobuzStoreRegionSpec,
    query: &str,
    page: u32,
    source_url: &str,
    html: &str,
) -> QobuzAlbumSearchResponse {
    let document = Html::parse_document(html);
    let link_selector = selector("a[href]");
    let image_selector = selector("img");
    let body_text = clean_text(&document.root_element().text().collect::<Vec<_>>().join(" "));
    let total = extract_total_count(&body_text);
    let total_pages = extract_total_pages(&body_text);
    let mut order = Vec::<String>::new();
    let mut albums = HashMap::<String, AlbumAccumulator>::new();

    for anchor in document.select(&link_selector) {
        let Some(href) = anchor.value().attr("href") else {
            continue;
        };
        let Some((id, album_url)) = album_link(region.code, href) else {
            continue;
        };

        if !albums.contains_key(&id) {
            order.push(id.clone());
            albums.insert(
                id.clone(),
                AlbumAccumulator {
                    id: id.clone(),
                    album_url,
                    ..AlbumAccumulator::default()
                },
            );
        }

        let Some(album) = albums.get_mut(&id) else {
            continue;
        };

        if album.title.is_none() {
            album.title = title_from_anchor(&anchor);
        }
        update_from_images(album, anchor.select(&image_selector));
        update_from_container(album, &anchor, &link_selector, &image_selector);
    }

    let items = order
        .into_iter()
        .filter_map(|id| albums.remove(&id))
        .filter_map(AlbumAccumulator::into_item)
        .collect::<Vec<_>>();

    QobuzAlbumSearchResponse {
        region: region.to_model(),
        query: query.to_string(),
        page,
        per_page: total
            .and_then(|total| {
                if total < QOBUZ_SEARCH_PAGE_SIZE {
                    Some(total)
                } else {
                    None
                }
            })
            .unwrap_or(QOBUZ_SEARCH_PAGE_SIZE),
        total,
        total_pages,
        source_url: source_url.to_string(),
        albums: items,
    }
}

impl AlbumAccumulator {
    fn into_item(self) -> Option<QobuzAlbumSearchItem> {
        let title = self
            .title
            .or_else(|| fallback_title_from_url(&self.album_url))
            .filter(|title| !title.trim().is_empty())?;

        Some(QobuzAlbumSearchItem {
            id: self.id,
            title,
            artist: self.artist,
            album_url: self.album_url,
            cover_url: self.cover_url,
            price: self.price,
            currency: self.currency,
            release_date_display: self.release_date_display,
            genre: self.genre,
            track_count: self.track_count,
            quality: self.quality,
        })
    }
}

fn update_from_container(
    album: &mut AlbumAccumulator,
    anchor: &ElementRef<'_>,
    link_selector: &Selector,
    image_selector: &Selector,
) {
    for ancestor in anchor.ancestors().skip(1).take(8) {
        let Some(container) = ElementRef::wrap(ancestor) else {
            continue;
        };
        let text_nodes = text_nodes(&container);
        let text = clean_text(&text_nodes.join(" "));
        if text.len() > 3_000 {
            continue;
        }

        let has_album_link = container.select(link_selector).any(|link| {
            link.value()
                .attr("href")
                .is_some_and(|href| href == album.album_url)
        });
        let has_cover = container.select(image_selector).any(|image| {
            image
                .value()
                .attr("src")
                .is_some_and(|src| src.contains("images/covers"))
        });
        let has_interpreter = container.select(link_selector).any(|link| {
            link.value()
                .attr("href")
                .is_some_and(|href| href.contains("/interpreter/"))
        });
        if !has_album_link && !has_cover && !has_interpreter {
            continue;
        }

        if album.artist.is_none() {
            album.artist = artist_from_container(&container, link_selector);
        }
        update_from_images(album, container.select(image_selector));
        update_from_text(album, &text, &text_nodes);
        break;
    }
}

fn update_from_images<'a>(
    album: &mut AlbumAccumulator,
    images: impl Iterator<Item = ElementRef<'a>>,
) {
    for image in images {
        if album.cover_url.is_none() {
            album.cover_url = image
                .value()
                .attr("src")
                .filter(|src| src.contains("images/covers"))
                .map(absolute_qobuz_url);
        }

        if album.quality.is_none() {
            let marker = [
                image.value().attr("alt").unwrap_or_default(),
                image.value().attr("title").unwrap_or_default(),
                image.value().attr("src").unwrap_or_default(),
            ]
            .join(" ")
            .to_lowercase();
            if marker.contains("hi-res") || marker.contains("hires") {
                album.quality = Some("hi_res".to_string());
            }
        }
    }
}

fn update_from_text(album: &mut AlbumAccumulator, text: &str, text_nodes: &[String]) {
    if album.track_count.is_none() {
        album.track_count = track_count_regex()
            .captures(text)
            .and_then(|captures| captures.get(1))
            .and_then(|value| value.as_str().replace(',', "").parse::<u32>().ok());
    }

    if album.price.is_none() {
        if let Some(captures) = price_regex().captures(text) {
            let currency = captures.get(1).map(|value| value.as_str().to_string());
            let amount = captures.get(2).map(|value| value.as_str().to_string());
            if let (Some(currency), Some(amount)) = (currency, amount) {
                album.price = Some(format!("{currency}{amount}"));
                album.currency = Some(currency);
            }
        }
    }

    if album.release_date_display.is_none() {
        album.release_date_display = release_date_regex()
            .captures(text)
            .and_then(|captures| captures.get(1))
            .map(|value| value.as_str().to_string());
    }

    if album.genre.is_none() {
        album.genre = genre_from_nodes(text_nodes, album.release_date_display.as_deref(), album);
    }
}

fn artist_from_container(container: &ElementRef<'_>, link_selector: &Selector) -> Option<String> {
    container.select(link_selector).find_map(|link| {
        let href = link.value().attr("href")?;
        if !href.contains("/interpreter/") {
            return None;
        }
        let text = clean_text(&link.text().collect::<Vec<_>>().join(" "));
        (!text.is_empty()).then_some(text)
    })
}

fn title_from_anchor(anchor: &ElementRef<'_>) -> Option<String> {
    let text = clean_text(&anchor.text().collect::<Vec<_>>().join(" "));
    if is_good_album_title(&text) {
        return Some(text);
    }

    anchor
        .value()
        .attr("title")
        .and_then(title_from_title_attribute)
        .filter(|title| is_good_album_title(title))
}

fn title_from_title_attribute(value: &str) -> Option<String> {
    let value = clean_text(value);
    if value.is_empty() {
        return None;
    }

    if let Some((_, rest)) = value.split_once("by ") {
        if let Some((title, _)) = rest.split_once(" on Qobuz") {
            return Some(title.trim().to_string());
        }
    }

    if let Some((_, rest)) = value.split_once("による") {
        if let Some((title, _)) = rest.split_once("の詳細") {
            return Some(title.trim().to_string());
        }
    }

    Some(value)
}

fn is_good_album_title(value: &str) -> bool {
    if value.is_empty() || value.len() > 180 {
        return false;
    }
    let normalized = value.to_lowercase();
    ![
        "cart",
        "add to cart",
        "カート",
        "tracks",
        "track",
        "トラック",
        "ご利用",
        "利用",
        "image",
        "qobuz",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
        && !value.contains('¥')
        && !value.contains('$')
        && !value.contains('€')
        && !value.contains('£')
}

fn album_link(region_code: &str, href: &str) -> Option<(String, String)> {
    let absolute_url = absolute_qobuz_url(href);
    let parsed = Url::parse(&absolute_url).ok()?;
    let segments = parsed.path_segments()?.collect::<Vec<_>>();
    if segments.len() < 4 {
        return None;
    }
    if !segments[0].eq_ignore_ascii_case(region_code) || segments[1] != "album" {
        return None;
    }
    let id = segments.last()?.trim();
    if id.is_empty() || id.contains('{') {
        return None;
    }

    Some((id.to_string(), parsed.to_string()))
}

fn absolute_qobuz_url(href: &str) -> String {
    let href = href.trim();
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    if href.starts_with('/') {
        return format!("{QOBUZ_BASE_URL}{href}");
    }

    format!("{QOBUZ_BASE_URL}/{href}")
}

fn fallback_title_from_url(album_url: &str) -> Option<String> {
    let parsed = Url::parse(album_url).ok()?;
    let segments = parsed.path_segments()?.collect::<Vec<_>>();
    let slug = segments.get(2)?;
    let title = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    (!title.is_empty()).then_some(title)
}

fn text_nodes(container: &ElementRef<'_>) -> Vec<String> {
    container
        .text()
        .map(clean_text)
        .filter(|value| !value.is_empty())
        .collect()
}

fn genre_from_nodes(
    text_nodes: &[String],
    release_date: Option<&str>,
    album: &AlbumAccumulator,
) -> Option<String> {
    let release_date = release_date?;
    for (index, node) in text_nodes.iter().enumerate() {
        if !node.contains(release_date) {
            continue;
        }

        if let Some((before_release, _)) = node.split_once(release_date) {
            let candidate = clean_text(before_release);
            if is_genre_candidate(&candidate, album) {
                return Some(candidate);
            }
        }

        for candidate in text_nodes[..index].iter().rev() {
            if is_genre_candidate(candidate, album) {
                return Some(candidate.clone());
            }
        }
    }

    None
}

fn is_genre_candidate(candidate: &str, album: &AlbumAccumulator) -> bool {
    if candidate.is_empty() || candidate.len() > 40 {
        return false;
    }
    if album
        .title
        .as_deref()
        .is_some_and(|title| title.eq_ignore_ascii_case(candidate))
        || album
            .artist
            .as_deref()
            .is_some_and(|artist| artist.eq_ignore_ascii_case(candidate))
    {
        return false;
    }

    let lower = candidate.to_lowercase();
    !lower.contains("cart")
        && !candidate.contains("カート")
        && !candidate.contains('¥')
        && !candidate.contains('$')
        && !candidate.contains('€')
        && !candidate.contains('£')
        && !track_count_regex().is_match(candidate)
        && candidate
            .chars()
            .any(|character| character.is_alphabetic() || !character.is_ascii())
}

fn extract_total_count(text: &str) -> Option<u32> {
    total_count_regex()
        .captures(text)
        .and_then(|captures| captures.get(3))
        .and_then(|value| {
            value
                .as_str()
                .replace([',', '.', ' '], "")
                .parse::<u32>()
                .ok()
        })
}

fn extract_total_pages(text: &str) -> Option<u32> {
    total_pages_regex()
        .captures(text)
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().replace(',', "").parse::<u32>().ok())
}

fn clean_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn selector(value: &str) -> Selector {
    Selector::parse(value).expect("static CSS selector is valid")
}

fn total_count_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"(?i)(\d+)\s*-\s*(\d+)\s+of\s+([\d,\.\s]+)\s+(?:albums?|アルバム)")
            .expect("total count regex is valid")
    })
}

fn total_pages_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"(?i)page\s+\d+\s+of\s+(\d+)").expect("total pages regex is valid")
    })
}

fn track_count_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"(?i)(\d+)\s*(?:tracks?|トラック)").expect("track count regex is valid")
    })
}

fn price_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"([¥$€£])\s?([\d,\.]+)").expect("price regex is valid"))
}

fn release_date_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        let month =
            r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
        Regex::new(
            &format!(
                r"((?:\d{{4}}年\d{{1,2}}月\d{{1,2}}日)|(?:\d{{4}}-\d{{2}}-\d{{2}})|(?:\d{{1,2}}\s+{month}\s+\d{{4}})|(?:{month}\s+\d{{1,2}},\s+\d{{4}}))"
            ),
        )
        .expect("release date regex is valid")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn album_search_url_builds_album_only_routes() {
        assert_eq!(
            album_search_url("jp-ja", "beatles mono", 1).expect("page 1"),
            "https://www.qobuz.com/jp-ja/search/albums/beatles%20mono?mode=grid"
        );
        assert_eq!(
            album_search_url("us-en", "daft/punk", 3).expect("page 3"),
            "https://www.qobuz.com/us-en/search/albums/daft%2Fpunk/page/3?mode=grid"
        );
    }

    #[test]
    fn album_search_url_rejects_bad_inputs() {
        assert!(matches!(
            album_search_url("unknown", "beatles", 1),
            Err(AppError::BadRequest {
                code: "invalid_qobuz_region",
                ..
            })
        ));
        assert!(matches!(
            album_search_url("jp-ja", " ", 1),
            Err(AppError::BadRequest {
                code: "missing_qobuz_query",
                ..
            })
        ));
        assert!(matches!(
            album_search_url("jp-ja", "beatles", 0),
            Err(AppError::BadRequest {
                code: "invalid_qobuz_page",
                ..
            })
        ));
    }

    #[test]
    fn parse_album_search_html_extracts_album_cards() {
        let region = region_by_code("jp-ja").expect("region");
        let html = r#"
            <html>
              <body>
                <h1>"beatles" search results 1-60 of 1000 Albums</h1>
                <div>Page 1 of 17</div>
                <article class="album">
                  <a href="/jp-ja/album/help-the-beatles/0060254767005"
                     title="The Beatles by Help! (Remastered) on Qobuz">
                    <img src="https://static.qobuz.com/images/covers/05/70/0060254767005_230.jpg"
                         alt="The Beatles Help!">
                  </a>
                  <a href="/jp-ja/album/help-the-beatles/0060254767005">Help! (Remastered)</a>
                  <a href="/jp-ja/interpreter/the-beatles/26390">The Beatles</a>
                  <span>Rock</span>
                  <span>1965年8月6日</span>
                  <span>14トラック</span>
                  <span>¥3,095</span>
                  <img alt="Hi-Res audio format logo" src="/assets-static/img/quality/hires.png">
                </article>
              </body>
            </html>
        "#;

        let response = parse_album_search_html(
            region,
            "beatles",
            1,
            "https://www.qobuz.com/jp-ja/search/albums/beatles?mode=grid",
            html,
        );

        assert_eq!(response.total, Some(1000));
        assert_eq!(response.total_pages, Some(17));
        assert_eq!(response.albums.len(), 1);
        assert_eq!(response.albums[0].id, "0060254767005");
        assert_eq!(response.albums[0].title, "Help! (Remastered)");
        assert_eq!(response.albums[0].artist.as_deref(), Some("The Beatles"));
        assert_eq!(response.albums[0].track_count, Some(14));
        assert_eq!(response.albums[0].price.as_deref(), Some("¥3,095"));
        assert_eq!(response.albums[0].currency.as_deref(), Some("¥"));
        assert_eq!(
            response.albums[0].release_date_display.as_deref(),
            Some("1965年8月6日")
        );
        assert_eq!(response.albums[0].genre.as_deref(), Some("Rock"));
        assert_eq!(response.albums[0].quality.as_deref(), Some("hi_res"));
    }
}
