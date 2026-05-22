use crate::{
    error::{AppError, AppResult},
    models::{QobuzAlbumSearchItem, QobuzAlbumSearchResponse, QobuzStoreRegion},
};
use indexmap::IndexMap;
use reqwest::{
    header::{ACCEPT, ACCEPT_LANGUAGE, REFERER},
    StatusCode, Url,
};
use serde::Deserialize;
use std::time::Duration;

const QOBUZ_BASE_URL: &str = "https://www.qobuz.com";
const DEFAULT_QOBUZ_REGION: &str = "jp-ja";
const QOBUZ_AUTOSUGGEST_PAGE: u32 = 1;

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
struct QobuzAutocompleteResponse {
    #[serde(default)]
    albums: IndexMap<String, QobuzAutocompleteAlbum>,
}

#[derive(Debug, Deserialize)]
struct QobuzAutocompleteAlbum {
    id: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    image: Option<String>,
    url: Option<String>,
    #[serde(default)]
    is_hires: bool,
    #[serde(default)]
    is_dsd: bool,
    #[serde(default)]
    is_dxd: bool,
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
            .header(ACCEPT, "*/*")
            .header(ACCEPT_LANGUAGE, region.accept_language)
            .header(REFERER, referer)
            .header("x-requested-with", "XMLHttpRequest")
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

        let autocomplete =
            serde_json::from_str::<QobuzAutocompleteResponse>(&body).map_err(|error| {
                AppError::upstream_unavailable(
                    "qobuz_unavailable",
                    format!("qobuz search response was not valid JSON: {error}"),
                )
            })?;

        Ok(normalize_autosuggest_response(
            region,
            query,
            page,
            &source_url,
            autocomplete,
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
    normalize_page(Some(page))?;
    let mut url = Url::parse(&format!(
        "{QOBUZ_BASE_URL}/v4/{}/catalog/search/autosuggest",
        region.code
    ))
    .expect("static qobuz autosuggest URL is valid");
    url.query_pairs_mut().append_pair("q", query);

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
    let page = page.unwrap_or(QOBUZ_AUTOSUGGEST_PAGE);
    if page != QOBUZ_AUTOSUGGEST_PAGE {
        return Err(AppError::bad_request(
            "invalid_qobuz_page",
            "qobuz autocomplete search only supports page 1",
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

fn normalize_autosuggest_response(
    region: QobuzStoreRegionSpec,
    query: &str,
    page: u32,
    source_url: &str,
    autocomplete: QobuzAutocompleteResponse,
) -> QobuzAlbumSearchResponse {
    let albums = autocomplete
        .albums
        .into_iter()
        .filter_map(|(key, album)| album.into_item(&key))
        .collect::<Vec<_>>();
    let per_page = albums.len() as u32;

    QobuzAlbumSearchResponse {
        region: region.to_model(),
        query: query.to_string(),
        page,
        per_page,
        total: None,
        total_pages: None,
        source_url: source_url.to_string(),
        albums,
    }
}

impl QobuzAutocompleteAlbum {
    fn into_item(self, fallback_id: &str) -> Option<QobuzAlbumSearchItem> {
        let id = clean_optional(self.id.as_deref()).unwrap_or_else(|| fallback_id.to_string());
        let title = clean_optional(self.title.as_deref())?;
        let album_url = clean_optional(self.url.as_deref()).map(|url| absolute_qobuz_url(&url))?;

        Some(QobuzAlbumSearchItem {
            id,
            title,
            artist: clean_optional(self.artist.as_deref()),
            album_url,
            cover_url: clean_optional(self.image.as_deref()).map(|url| absolute_qobuz_url(&url)),
            price: None,
            currency: None,
            release_date_display: None,
            genre: None,
            track_count: None,
            quality: album_quality(self.is_hires, self.is_dsd, self.is_dxd),
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

fn clean_optional(value: Option<&str>) -> Option<String> {
    value
        .map(clean_text)
        .filter(|value| !value.trim().is_empty())
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
    fn store_regions_exclude_empty_album_autosuggest_regions() {
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
    fn album_search_url_builds_autosuggest_routes() {
        assert_eq!(
            album_search_url("jp-ja", "beatles mono", 1).expect("page 1"),
            "https://www.qobuz.com/v4/jp-ja/catalog/search/autosuggest?q=beatles+mono"
        );
        assert_eq!(
            album_search_url("us-en", "daft/punk", 1).expect("page 1"),
            "https://www.qobuz.com/v4/us-en/catalog/search/autosuggest?q=daft%2Fpunk"
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
            album_search_url("jp-ja", "beatles", 2),
            Err(AppError::BadRequest {
                code: "invalid_qobuz_page",
                ..
            })
        ));
    }

    #[test]
    fn normalize_autosuggest_response_extracts_album_suggestions_only() {
        let region = region_by_code("jp-ja").expect("region");
        let body = r#"
            {
              "albums": {
                "kv6tfmvmgn0wb": {
                  "id": "kv6tfmvmgn0wb",
                  "title": "Anthology 4",
                  "artist": "ザ・ビートルズ",
                  "image": "https://static.qobuz.com/images/covers/wb/n0/kv6tfmvmgn0wb_230.jpg",
                  "url": "https://www.qobuz.com/jp-ja/album/anthology-4-the-beatles/kv6tfmvmgn0wb",
                  "url_encoded": "aHR0cHM6Ly93d3cucW9idXouY29t",
                  "is_hires": true,
                  "is_dsd": false,
                  "is_dxd": false
                },
                "iafrpq7v7gr2a": {
                  "id": "iafrpq7v7gr2a",
                  "title": "Anthology 4",
                  "artist": "The Beatles",
                  "image": "/images/covers/2a/gr/iafrpq7v7gr2a_230.jpg",
                  "url": "/jp-ja/album/anthology-4-the-beatles/iafrpq7v7gr2a",
                  "is_hires": true,
                  "is_dsd": true,
                  "is_dxd": true
                }
              },
              "artists": [
                {
                  "id": 26390,
                  "name": "ザ・ビートルズ"
                }
              ],
              "tracks": [
                {
                  "id": 64868955,
                  "title": "カム・トゥゲザー"
                }
              ],
              "labels": []
            }
        "#;
        let autocomplete =
            serde_json::from_str::<QobuzAutocompleteResponse>(body).expect("autosuggest JSON");

        let response = normalize_autosuggest_response(
            region,
            "beatles",
            1,
            "https://www.qobuz.com/v4/jp-ja/catalog/search/autosuggest?q=beatles",
            autocomplete,
        );

        assert_eq!(response.region.code, "jp-ja");
        assert_eq!(response.query, "beatles");
        assert_eq!(response.page, 1);
        assert_eq!(response.per_page, 2);
        assert_eq!(response.total, None);
        assert_eq!(response.total_pages, None);
        assert_eq!(response.albums.len(), 2);
        assert_eq!(response.albums[0].id, "kv6tfmvmgn0wb");
        assert_eq!(response.albums[0].title, "Anthology 4");
        assert_eq!(response.albums[0].artist.as_deref(), Some("ザ・ビートルズ"));
        assert_eq!(
            response.albums[0].album_url,
            "https://www.qobuz.com/jp-ja/album/anthology-4-the-beatles/kv6tfmvmgn0wb"
        );
        assert_eq!(
            response.albums[0].cover_url.as_deref(),
            Some("https://static.qobuz.com/images/covers/wb/n0/kv6tfmvmgn0wb_230.jpg")
        );
        assert_eq!(response.albums[0].price, None);
        assert_eq!(response.albums[0].track_count, None);
        assert_eq!(response.albums[0].quality.as_deref(), Some("hi_res"));
        assert_eq!(
            response.albums[1].album_url,
            "https://www.qobuz.com/jp-ja/album/anthology-4-the-beatles/iafrpq7v7gr2a"
        );
        assert_eq!(
            response.albums[1].cover_url.as_deref(),
            Some("https://www.qobuz.com/images/covers/2a/gr/iafrpq7v7gr2a_230.jpg")
        );
        assert_eq!(
            response.albums[1].quality.as_deref(),
            Some("hi_res,dsd,dxd")
        );
    }
}
