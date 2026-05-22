import React, { useState, useEffect } from "react";
import { apiClient } from "../api/client";
import { QobuzStoreRegion, QobuzAlbumSearchResponse } from "../api/types";
import { Search, Music, ExternalLink, RefreshCw, AlertCircle, ShoppingBag, Disc } from "lucide-react";

export const QobuzSearchPage: React.FC = () => {
  const [regions, setRegions] = useState<QobuzStoreRegion[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsError, setRegionsError] = useState<string | null>(null);

  const [selectedRegion, setSelectedRegion] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<QobuzAlbumSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const fetchRegions = async () => {
    setRegionsLoading(true);
    setRegionsError(null);
    try {
      const data = await apiClient.getQobuzRegions();
      setRegions(data);
      if (data.length > 0) {
        // Default to jp-ja if available, otherwise first region
        const defaultReg = data.find(r => r.code === "jp-ja") || data[0];
        setSelectedRegion(defaultReg.code);
      }
    } catch (err) {
      setRegionsError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegionsLoading(false);
    }
  };

  // Fetch regions on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRegions();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !selectedRegion) return;

    setSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const res = await apiClient.searchQobuzAlbums(selectedRegion, query.trim(), 1);
      setSearchResult(res);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-chat)",
        padding: "24px",
        overflowY: "auto",
      }}
      className="animate-fade-in"
    >
      {/* Header */}
      <div style={{ marginBottom: "24px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <ShoppingBag size={20} style={{ color: "var(--accent-blue)" }} />
          <span>Qobuz 商店专辑搜索</span>
        </h1>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.4" }}>
          搜索 Qobuz 各地区商店的专辑信息。选择地区并输入关键词即可查询，点击专辑可直接打开官方商店页面。
        </p>
      </div>

      {/* Main search card */}
      <div
        style={{
          backgroundColor: "var(--bg-sidebar)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        {regionsLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
            <span>正在加载商店可用地区...</span>
          </div>
        ) : regionsError ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent-red)", fontSize: "0.85rem" }}>
              <AlertCircle size={16} />
              <span>{regionsError}</span>
            </div>
            <button onClick={fetchRegions} className="btn-secondary" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: "0.75rem" }}>
              重试加载
            </button>
          </div>
        ) : (
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
            {/* Region select */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)" }}>商店地区</label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="settings-input"
                style={{
                  width: "180px",
                  height: "36px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  backgroundColor: "var(--bg-app)",
                }}
              >
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label} ({r.country})
                  </option>
                ))}
              </select>
            </div>

            {/* Keyword input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: "200px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)" }}>搜索关键词</label>
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="text"
                  placeholder="输入专辑名称、艺人..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="settings-input"
                  style={{
                    paddingLeft: "36px",
                    fontSize: "0.85rem",
                    height: "36px",
                    backgroundColor: "var(--bg-app)",
                  }}
                />
              </div>
            </div>

            {/* Search button */}
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="btn-primary"
              style={{
                height: "36px",
                padding: "0 20px",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {searching ? (
                <>
                  <RefreshCw size={14} style={{ animation: "spin 1.5s linear infinite" }} />
                  <span>搜索中...</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>搜索</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Results panel */}
      <div style={{ flex: 1 }}>
        {searching && (
          <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text-muted)" }}>
            <RefreshCw size={32} style={{ animation: "spin 1.5s linear infinite", opacity: 0.5, marginBottom: "16px" }} />
            <div style={{ fontSize: "0.9rem" }}>正在请求 Qobuz 商店数据，请稍候...</div>
          </div>
        )}

        {searchError && (
          <div
            style={{
              backgroundColor: "var(--accent-red-transparent)",
              border: "1px solid var(--accent-red)",
              color: "var(--accent-red)",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "0.85rem",
            }}
          >
            <AlertCircle size={18} />
            <div>
              <strong>搜索失败</strong>: {searchError}
            </div>
          </div>
        )}

        {!searching && !searchError && searchResult && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                找到 {searchResult.albums.length} 个专辑结果 • 数据源:{" "}
                <a href={searchResult.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-blue)" }}>
                  Qobuz Store <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
                </a>
              </span>
            </div>

            {searchResult.albums.length === 0 ? (
              <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text-muted)", backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                <Disc size={36} style={{ opacity: 0.2, marginBottom: "12px" }} />
                <div style={{ fontSize: "0.85rem" }}>未找到符合条件的专辑。</div>
                <div style={{ fontSize: "0.75rem", marginTop: "4px" }}>请尝试更换其他地区或修改搜索关键词。</div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: "20px",
                }}
              >
                {searchResult.albums.map((album) => (
                  <a
                    key={album.id}
                    href={album.albumUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      backgroundColor: "var(--bg-sidebar)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      overflow: "hidden",
                      textDecoration: "none",
                      color: "inherit",
                      transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                    className="qobuz-album-card"
                  >
                    {/* Cover image container */}
                    <div style={{ position: "relative", width: "100%", paddingBottom: "100%", backgroundColor: "var(--bg-app)" }}>
                      {album.coverUrl ? (
                        <img
                          src={album.coverUrl}
                          alt={album.title}
                          loading="lazy"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-muted)",
                            gap: "8px",
                          }}
                        >
                          <Music size={24} style={{ opacity: 0.3 }} />
                          <span style={{ fontSize: "0.7rem" }}>暂无封面</span>
                        </div>
                      )}

                      {/* Quality Badge */}
                      {album.quality && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: "8px",
                            right: "8px",
                            backgroundColor: "rgba(15, 23, 42, 0.85)",
                            backdropFilter: "blur(4px)",
                            color: "#60a5fa",
                            fontSize: "0.6rem",
                            fontWeight: "bold",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {album.quality}
                        </span>
                      )}
                    </div>

                    {/* Album Info */}
                    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                      <span
                        style={{
                          fontWeight: "600",
                          fontSize: "0.8rem",
                          color: "var(--text-primary)",
                          lineHeight: "1.3",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                        title={album.title}
                      >
                        {album.title}
                      </span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={album.artist}
                      >
                        {album.artist || "未知艺人"}
                      </span>

                      {/* Metadata row */}
                      <div
                        style={{
                          marginTop: "auto",
                          paddingTop: "8px",
                          borderTop: "1px solid var(--border-color)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.68rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        <span>
                          {album.genre ? album.genre : ""}
                          {album.trackCount ? ` • ${album.trackCount}首` : ""}
                        </span>
                        {album.price && (
                          <span style={{ fontWeight: "600", color: "var(--text-primary)", fontSize: "0.72rem" }}>
                            {album.currency || ""}{album.price}
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover effects inside component style */}
      <style>{`
        .qobuz-album-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg);
          border-color: var(--accent-blue) !important;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
