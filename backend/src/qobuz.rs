use crate::{
    error::{AppError, AppResult},
    models::{QobuzAlbumSearchItem, QobuzAlbumSearchResponse, QobuzStoreRegion},
};
use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use reqwest::{
    header::{ACCEPT, ACCEPT_LANGUAGE, REFERER},
    StatusCode, Url,
};
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

const QOBUZ_BASE_URL: &str = "https://www.qobuz.com";
const DEFAULT_QOBUZ_REGION: &str = "jp-ja";
const QOBUZ_DEFAULT_PAGE: u32 = 1;
const QOBUZ_RELEASE_DATE_NOON_OFFSET_SECONDS: i64 = 12 * 60 * 60;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QobuzSearchLiveProps {
    #[serde(default)]
    albums: String,
    pagination_data: Option<QobuzSearchPaginationData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QobuzSearchPaginationData {
    current_page: Option<u32>,
    total_pages: Option<u32>,
    total_results: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QobuzSearchAlbum {
    id: Option<String>,
    slug: Option<String>,
    image: Option<QobuzSearchImage>,
    title: Option<String>,
    #[serde(default)]
    artists: Vec<QobuzSearchArtist>,
    genre: Option<QobuzSearchNamedValue>,
    released_at: Option<Value>,
    tracks_count: Option<u32>,
    #[serde(default)]
    has_hires_logo: bool,
    #[serde(default)]
    has_dsd_logo: bool,
    #[serde(default)]
    has_dxd_logo: bool,
    bit_depth: Option<String>,
    sampling_rate: Option<String>,
    price: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct QobuzSearchImage {
    small: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QobuzSearchArtist {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QobuzSearchNamedValue {
    name: Option<String>,
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
        let referer = format!("{QOBUZ_BASE_URL}/{}/shop", region.code);
        let response = self
            .http
            .get(&source_url)
            .header(
                ACCEPT,
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            )
            .header(ACCEPT_LANGUAGE, region.accept_language)
            .header(REFERER, referer)
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

        let body = response.text().await.map_err(|error| {
            AppError::upstream_unavailable(
                "qobuz_unavailable",
                format!("qobuz search response could not be read: {error}"),
            )
        })?;

        normalize_search_page_response(region, query, page, &source_url, &body)
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
    let mut url = Url::parse(QOBUZ_BASE_URL).expect("static qobuz base URL is valid");
    {
        let mut segments = url
            .path_segments_mut()
            .expect("qobuz base URL supports path segments");
        segments
            .push(region.code)
            .push("search")
            .push("albums")
            .push(query);
        if page > QOBUZ_DEFAULT_PAGE {
            segments.push("page").push(&page.to_string());
        }
    }
    url.query_pairs_mut().append_pair("mode", "grid");

    Ok(url.to_string())
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
    let page = page.unwrap_or(QOBUZ_DEFAULT_PAGE);
    if page == 0 {
        return Err(AppError::bad_request(
            "invalid_qobuz_page",
            "qobuz search page must be greater than 0",
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

fn normalize_search_page_response(
    region: QobuzStoreRegionSpec,
    query: &str,
    page: u32,
    source_url: &str,
    body: &str,
) -> AppResult<QobuzAlbumSearchResponse> {
    let raw_props = extract_catalog_search_live_props(body).ok_or_else(|| {
        AppError::upstream_unavailable(
            "qobuz_unavailable",
            "qobuz search page did not include catalog search result data",
        )
    })?;
    let props_json = html_unescape(raw_props);
    let props = serde_json::from_str::<QobuzSearchLiveProps>(&props_json).map_err(|error| {
        AppError::upstream_unavailable(
            "qobuz_unavailable",
            format!("qobuz search result data was not valid JSON: {error}"),
        )
    })?;
    let album_map = if props.albums.trim().is_empty() {
        IndexMap::new()
    } else {
        serde_json::from_str::<IndexMap<String, QobuzSearchAlbum>>(&props.albums).map_err(
            |error| {
                AppError::upstream_unavailable(
                    "qobuz_unavailable",
                    format!("qobuz album search data was not valid JSON: {error}"),
                )
            },
        )?
    };
    let albums = album_map
        .into_iter()
        .filter_map(|(key, album)| album.into_item(region, &key))
        .collect::<Vec<_>>();
    let per_page = albums.len() as u32;
    let pagination = props.pagination_data;

    Ok(QobuzAlbumSearchResponse {
        region: region.to_model(),
        query: query.to_string(),
        page: pagination
            .as_ref()
            .and_then(|data| data.current_page)
            .unwrap_or(page),
        per_page,
        total: pagination.as_ref().and_then(|data| data.total_results),
        total_pages: pagination.as_ref().and_then(|data| data.total_pages),
        source_url: source_url.to_string(),
        albums,
    })
}

impl QobuzSearchAlbum {
    fn into_item(
        self,
        region: QobuzStoreRegionSpec,
        fallback_id: &str,
    ) -> Option<QobuzAlbumSearchItem> {
        let id = clean_optional_html(self.id.as_deref()).unwrap_or_else(|| fallback_id.to_string());
        let slug = clean_optional_html(self.slug.as_deref())?;
        let title = clean_optional_html(self.title.as_deref())?;
        let album_url = format!("{QOBUZ_BASE_URL}/{}/album/{slug}/{id}", region.code);
        let artist = self
            .artists
            .into_iter()
            .filter_map(|artist| clean_optional_html(artist.name.as_deref()))
            .collect::<Vec<_>>()
            .join(", ");
        let price = price_to_string(self.price.as_ref());
        let currency = price
            .as_ref()
            .and_then(|_| currency_symbol(region.code))
            .map(str::to_string);

        Some(QobuzAlbumSearchItem {
            id,
            title,
            artist: (!artist.is_empty()).then_some(artist),
            album_url,
            cover_url: self
                .image
                .and_then(|image| clean_optional_html(image.small.as_deref()))
                .map(|url| absolute_qobuz_url(&url)),
            price,
            currency,
            release_date_display: release_date_display(self.released_at.as_ref()),
            genre: self
                .genre
                .and_then(|genre| clean_optional_html(genre.name.as_deref())),
            track_count: self.tracks_count,
            quality: album_quality(self.has_hires_logo, self.has_dsd_logo, self.has_dxd_logo),
            bit_depth: parse_bit_depth(self.bit_depth.as_deref()),
            sample_rate: parse_sample_rate(self.sampling_rate.as_deref()),
        })
    }
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

fn clean_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clean_optional_html(value: Option<&str>) -> Option<String> {
    value
        .map(html_unescape)
        .map(|value| clean_text(&value))
        .filter(|value| !value.trim().is_empty())
}

fn extract_catalog_search_live_props(body: &str) -> Option<&str> {
    let marker = r#"data-live-name-value="pages:catalog-search-results""#;
    let mut offset = 0;

    while let Some(relative_index) = body[offset..].find(marker) {
        let marker_index = offset + relative_index;
        let tag_start = body[..marker_index].rfind('<').unwrap_or(marker_index);
        let tag_end = body[marker_index..]
            .find('>')
            .map(|index| marker_index + index)
            .unwrap_or(body.len());
        let tag = &body[tag_start..tag_end];

        if let Some(value) = extract_html_attr(tag, "data-live-props-value") {
            return Some(value);
        }

        offset = marker_index + marker.len();
    }

    None
}

fn extract_html_attr<'a>(tag: &'a str, attr: &str) -> Option<&'a str> {
    let needle = format!(r#"{attr}=""#);
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    Some(&tag[start..end])
}

fn html_unescape(value: &str) -> String {
    let mut decoded = String::with_capacity(value.len());
    let mut rest = value;

    while let Some(entity_start) = rest.find('&') {
        decoded.push_str(&rest[..entity_start]);
        let after_amp = &rest[entity_start + 1..];

        if let Some(entity_end) = after_amp.find(';') {
            let entity = &after_amp[..entity_end];
            if let Some(replacement) = decode_html_entity(entity) {
                decoded.push_str(&replacement);
                rest = &after_amp[entity_end + 1..];
                continue;
            }
        }

        decoded.push('&');
        rest = after_amp;
    }

    decoded.push_str(rest);
    decoded
}

fn decode_html_entity(entity: &str) -> Option<String> {
    match entity {
        "quot" => Some("\"".to_string()),
        "amp" => Some("&".to_string()),
        "apos" => Some("'".to_string()),
        "lt" => Some("<".to_string()),
        "gt" => Some(">".to_string()),
        "nbsp" => Some(" ".to_string()),
        _ if entity.starts_with("#x") || entity.starts_with("#X") => {
            u32::from_str_radix(&entity[2..], 16)
                .ok()
                .and_then(char::from_u32)
                .map(|value| value.to_string())
        }
        _ if entity.starts_with('#') => entity[1..]
            .parse::<u32>()
            .ok()
            .and_then(char::from_u32)
            .map(|value| value.to_string()),
        _ => None,
    }
}

fn release_date_display(value: Option<&Value>) -> Option<String> {
    let seconds = json_value_to_i64(value?)?;
    let adjusted = seconds
        .checked_add(QOBUZ_RELEASE_DATE_NOON_OFFSET_SECONDS)
        .unwrap_or(seconds);
    DateTime::<Utc>::from_timestamp(adjusted, 0)
        .map(|datetime| datetime.format("%Y-%m-%d").to_string())
}

fn json_value_to_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|value| i64::try_from(value).ok())),
        Value::String(value) => value.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn price_to_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::Number(number) => price_number_to_string(number),
        Value::String(value) => clean_optional_html(Some(value)),
        _ => None,
    }
}

fn price_number_to_string(number: &serde_json::Number) -> Option<String> {
    if let Some(value) = number.as_u64() {
        return Some(group_price_digits(&value.to_string()));
    }
    if let Some(value) = number.as_i64() {
        let sign = if value < 0 { "-" } else { "" };
        return Some(format!(
            "{sign}{}",
            group_price_digits(&value.abs().to_string())
        ));
    }
    number.as_f64().map(|value| {
        let mut formatted = format!("{value:.2}");
        while formatted.contains('.') && formatted.ends_with('0') {
            formatted.pop();
        }
        if formatted.ends_with('.') {
            formatted.pop();
        }
        group_decimal_price(&formatted)
    })
}

fn group_decimal_price(value: &str) -> String {
    if let Some((integer, fraction)) = value.split_once('.') {
        if fraction.is_empty() {
            group_price_digits(integer)
        } else {
            format!("{}.{}", group_price_digits(integer), fraction)
        }
    } else {
        group_price_digits(value)
    }
}

fn group_price_digits(value: &str) -> String {
    let (sign, digits) = value
        .strip_prefix('-')
        .map(|digits| ("-", digits))
        .unwrap_or(("", value));
    let mut grouped = String::with_capacity(value.len() + value.len() / 3);
    for (index, ch) in digits.chars().rev().enumerate() {
        if index > 0 && index % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(ch);
    }
    let grouped = grouped.chars().rev().collect::<String>();
    format!("{sign}{grouped}")
}

fn currency_symbol(region_code: &str) -> Option<&'static str> {
    match region_code {
        "jp-ja" => Some("¥"),
        "gb-en" => Some("£"),
        "ch-de" | "ch-fr" => Some("CHF "),
        "dk-en" | "no-en" | "se-en" => Some("kr "),
        "au-en" => Some("A$"),
        "ca-en" | "ca-fr" => Some("C$"),
        "nz-en" => Some("NZ$"),
        "us-en" => Some("$"),
        "at-de" | "be-fr" | "be-nl" | "fi-en" | "fr-fr" | "de-de" | "ie-en" | "it-it" | "lu-de"
        | "lu-fr" | "nl-nl" | "es-es" => Some("€"),
        _ => None,
    }
}

fn parse_bit_depth(value: Option<&str>) -> Option<u32> {
    value?
        .split(|ch: char| !ch.is_ascii_digit())
        .find(|part| !part.is_empty())
        .and_then(|part| part.parse::<u32>().ok())
}

fn parse_sample_rate(value: Option<&str>) -> Option<String> {
    let value = clean_optional_html(value)?;
    let value = value
        .replace("kHz", "")
        .replace("khz", "")
        .replace("KHz", "");
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn album_quality(is_hires: bool, is_dsd: bool, is_dxd: bool) -> Option<String> {
    let mut quality = Vec::new();
    if is_hires {
        quality.push("hi_res");
    }
    if is_dsd {
        quality.push("dsd");
    }
    if is_dxd {
        quality.push("dxd");
    }

    (!quality.is_empty()).then(|| quality.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_regions_exclude_empty_album_search_regions() {
        let regions = qobuz_store_regions();
        let removed_codes = ["ar-es", "br-pt", "cl-es", "co-es", "mx-es", "pt-pt"];

        assert_eq!(regions.len(), 24);
        for removed_code in removed_codes {
            assert!(!regions.iter().any(|region| region.code == removed_code));
            assert!(matches!(
                album_search_url(removed_code, "beatles", 1),
                Err(AppError::BadRequest {
                    code: "invalid_qobuz_region",
                    ..
                })
            ));
        }
    }

    #[test]
    fn album_search_url_builds_full_album_search_routes() {
        assert_eq!(
            album_search_url("jp-ja", "beatles mono", 1).expect("page 1"),
            "https://www.qobuz.com/jp-ja/search/albums/beatles%20mono?mode=grid"
        );
        assert_eq!(
            album_search_url("us-en", "daft/punk", 2).expect("page 2"),
            "https://www.qobuz.com/us-en/search/albums/daft%2Fpunk/page/2?mode=grid"
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
        assert!(album_search_url("jp-ja", "beatles", 2).is_ok());
    }

    #[test]
    fn normalize_search_page_response_extracts_full_album_results() {
        let region = region_by_code("jp-ja").expect("region");
        let albums = serde_json::json!({
            "xywvdso23l96a": {
                "id": "xywvdso23l96a",
                "slug": "one-deep-river-mark-knopfler",
                "image": { "small": "https://static.qobuz.com/images/covers/6a/l9/xywvdso23l96a_230.jpg" },
                "title": "One Deep River (Deluxe)",
                "artists": [{ "id": "12051", "slug": "mark-knopfler", "name": "Mark Knopfler" }],
                "genre": { "id": "119", "slug": "rock", "name": "Rock" },
                "releasedAt": "1712872800",
                "tracksCount": 21,
                "hasHiresLogo": true,
                "hasDsdLogo": false,
                "hasDxdLogo": false,
                "bitDepth": "24-Bit",
                "samplingRate": "192 kHz",
                "price": 3749
            },
            "rh10buxv8ekda": {
                "id": "rh10buxv8ekda",
                "slug": "the-yellow-river-the-butterfly-lovers-jie-chen-new-zealand-symphony-orchestra-carolyn-kuan",
                "image": { "small": "/images/covers/da/ek/rh10buxv8ekda_230.jpg" },
                "title": "The Yellow River &amp; The Butterfly Lovers",
                "artists": [
                    { "id": "33672", "slug": "jie-chen", "name": "Jie Chen" },
                    { "id": "80862", "slug": "carolyn-kuan", "name": "Carolyn Kuan" }
                ],
                "genre": { "id": "10", "slug": "classique", "name": "Classique" },
                "releasedAt": "1349128800",
                "tracksCount": 5,
                "hasHiresLogo": true,
                "hasDsdLogo": true,
                "hasDxdLogo": false,
                "bitDepth": "24-Bit",
                "samplingRate": "96 kHz",
                "price": 1920
            }
        })
        .to_string();
        let live_props = serde_json::json!({
            "mode": "grid",
            "albums": albums,
            "paginationData": {
                "currentPage": 1,
                "totalPages": 17,
                "totalResults": 1000
            }
        })
        .to_string();
        let body = format!(
            r#"<div data-controller="eqho--pages--catalog-search-results live" data-live-name-value="pages:catalog-search-results" data-live-props-value="{}"></div>"#,
            html_escape_attr(&live_props)
        );

        let response = normalize_search_page_response(
            region,
            "River",
            1,
            "https://www.qobuz.com/jp-ja/search/albums/River?mode=grid",
            &body,
        )
        .expect("search page response");

        assert_eq!(response.region.code, "jp-ja");
        assert_eq!(response.query, "River");
        assert_eq!(response.page, 1);
        assert_eq!(response.per_page, 2);
        assert_eq!(response.total, Some(1000));
        assert_eq!(response.total_pages, Some(17));
        assert_eq!(response.albums.len(), 2);
        let deluxe = response
            .albums
            .iter()
            .find(|album| album.id == "xywvdso23l96a")
            .expect("deluxe album");
        assert_eq!(deluxe.title, "One Deep River (Deluxe)");
        assert_eq!(deluxe.artist.as_deref(), Some("Mark Knopfler"));
        assert_eq!(
            deluxe.album_url,
            "https://www.qobuz.com/jp-ja/album/one-deep-river-mark-knopfler/xywvdso23l96a"
        );
        assert_eq!(
            deluxe.cover_url.as_deref(),
            Some("https://static.qobuz.com/images/covers/6a/l9/xywvdso23l96a_230.jpg")
        );
        assert_eq!(deluxe.price.as_deref(), Some("3,749"));
        assert_eq!(deluxe.currency.as_deref(), Some("¥"));
        assert_eq!(deluxe.release_date_display.as_deref(), Some("2024-04-12"));
        assert_eq!(deluxe.genre.as_deref(), Some("Rock"));
        assert_eq!(deluxe.track_count, Some(21));
        assert_eq!(deluxe.quality.as_deref(), Some("hi_res"));
        assert_eq!(deluxe.bit_depth, Some(24));
        assert_eq!(deluxe.sample_rate.as_deref(), Some("192"));

        let yellow_river = response
            .albums
            .iter()
            .find(|album| album.id == "rh10buxv8ekda")
            .expect("yellow river album");
        assert_eq!(
            yellow_river.title,
            "The Yellow River & The Butterfly Lovers"
        );
        assert_eq!(
            yellow_river.artist.as_deref(),
            Some("Jie Chen, Carolyn Kuan")
        );
        assert_eq!(
            yellow_river.album_url,
            "https://www.qobuz.com/jp-ja/album/the-yellow-river-the-butterfly-lovers-jie-chen-new-zealand-symphony-orchestra-carolyn-kuan/rh10buxv8ekda"
        );
        assert_eq!(
            yellow_river.cover_url.as_deref(),
            Some("https://www.qobuz.com/images/covers/da/ek/rh10buxv8ekda_230.jpg")
        );
        assert_eq!(yellow_river.quality.as_deref(), Some("hi_res,dsd"));
    }

    #[tokio::test]
    #[ignore = "live Qobuz debug probe; run manually when re-verifying upstream markup"]
    async fn test_print_raw_search_page() {
        let client = QobuzShopClient::new();
        let region = "jp-ja";
        let query = "River";
        let url = album_search_url(region, query, 1).unwrap();
        let response = client
            .http
            .get(&url)
            .header("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
            .header("accept-language", "ja-JP,ja;q=0.9,en;q=0.8")
            .header("referer", "https://www.qobuz.com/jp-ja/shop")
            .send()
            .await
            .unwrap();
        let text = response.text().await.unwrap();
        println!("RAW SEARCH PAGE RESPONSE:\n{}", text);
    }

    #[tokio::test]
    #[ignore = "live Qobuz region probe; run manually when re-verifying upstream availability"]
    async fn test_live_all_store_regions_search_river() {
        let client = QobuzShopClient::new();
        for region in QOBUZ_STORE_REGIONS {
            let response = client
                .search_albums(Some(region.code), "River", Some(1))
                .await
                .unwrap_or_else(|error| panic!("{} failed: {error}", region.code));
            assert!(
                !response.albums.is_empty(),
                "{} returned no albums",
                region.code
            );
        }
    }

    fn html_escape_attr(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('"', "&quot;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    }
}
