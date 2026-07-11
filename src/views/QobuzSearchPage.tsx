import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import { QobuzStoreRegion, QobuzAlbumSearchResponse, QobuzAlbumSearchItem } from "../api/types";
import { useApp } from "../context/AppContext";
import { PageHeader } from "../components/PageHeader";
import { Search, Music, ExternalLink, AlertCircle, ShoppingBag, Disc, Download, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const REGION_CN_MAP: Record<string, string> = {
  "au-en": "澳大利亚 (英文)", "at-de": "奥地利 (德文)", "be-fr": "比利时 (法文)", "be-nl": "比利时 (荷兰文)",
  "ca-en": "加拿大 (英文)", "ca-fr": "加拿大 (法文)", "dk-en": "丹麦 (英文)", "fi-en": "芬兰 (英文)",
  "fr-fr": "法国 (法文)", "de-de": "德国 (德文)", "ie-en": "爱尔兰 (英文)", "it-it": "意大利 (意文)",
  "jp-ja": "日本 (日文)", "lu-de": "卢森堡 (德文)", "lu-fr": "卢森堡 (法文)", "nl-nl": "荷兰 (荷兰文)",
  "nz-en": "新西兰 (英文)", "no-en": "挪威 (英文)", "es-es": "西班牙 (西班牙文)", "se-en": "瑞典 (英文)",
  "ch-de": "瑞士 (德文)", "ch-fr": "瑞士 (法文)", "gb-en": "英国 (英文)", "us-en": "美国 (英文)",
};

type PushNotice = { tone: "success" | "error"; message: string };

type QobuzSearchCache = {
  selectedRegion: string;
  query: string;
  searchResult: QobuzAlbumSearchResponse | null;
  searchError: string | null;
};

const qobuzSearchCache: QobuzSearchCache = {
  selectedRegion: "",
  query: "",
  searchResult: null,
  searchError: null,
};

const formatQobuzSampleRate = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : trimmed;
};

export const QobuzSearchPage: React.FC = () => {
  const { addToDownloadQueue } = useApp();
  const [regions, setRegions] = useState<QobuzStoreRegion[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsError, setRegionsError] = useState<string | null>(null);

  const [selectedRegion, setSelectedRegion] = useState(qobuzSearchCache.selectedRegion);
  const [query, setQuery] = useState(qobuzSearchCache.query);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<QobuzAlbumSearchResponse | null>(qobuzSearchCache.searchResult);
  const [searchError, setSearchError] = useState<string | null>(qobuzSearchCache.searchError);
  const [pushingAlbumId, setPushingAlbumId] = useState<string | null>(null);
  const [pushNotice, setPushNotice] = useState<PushNotice | null>(null);

  const updateSelectedRegion = (value: string) => {
    qobuzSearchCache.selectedRegion = value;
    setSelectedRegion(value);
  };
  const updateQuery = (value: string) => {
    qobuzSearchCache.query = value;
    setQuery(value);
  };
  const updateSearchResult = (value: QobuzAlbumSearchResponse | null) => {
    qobuzSearchCache.searchResult = value;
    setSearchResult(value);
  };
  const updateSearchError = (value: string | null) => {
    qobuzSearchCache.searchError = value;
    setSearchError(value);
  };

  const fetchRegions = useCallback(async () => {
    setRegionsLoading(true);
    setRegionsError(null);
    try {
      const data = await apiClient.getQobuzRegions();
      setRegions(data);
      if (data.length > 0) {
        const defaultReg = data.find((r) => r.code === "jp-ja") || data[0];
        const cachedRegion = qobuzSearchCache.selectedRegion;
        const nextRegion = cachedRegion && data.some((region) => region.code === cachedRegion)
          ? cachedRegion
          : defaultReg.code;
        qobuzSearchCache.selectedRegion = nextRegion;
        setSelectedRegion(nextRegion);
      }
    } catch (err) {
      setRegionsError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegionsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRegions();
  }, [fetchRegions]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !selectedRegion) return;

    setSearching(true);
    updateSearchError(null);
    updateSearchResult(null);

    try {
      const res = await apiClient.searchQobuzAlbums(selectedRegion, query.trim(), 1);
      updateSearchResult(res);
    } catch (err) {
      updateSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const handlePushDownload = async (album: QobuzAlbumSearchItem) => {
    setPushingAlbumId(album.id);
    setPushNotice(null);
    try {
      await addToDownloadQueue(album);
      setPushNotice({ tone: "success", message: `已推送《${album.title}》到下载队列。` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPushNotice({ tone: "error", message: `推送失败:${message}` });
    } finally {
      setPushingAlbumId((current) => (current === album.id ? null : current));
    }
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6 max-sm:p-4">
        <PageHeader
          icon={<ShoppingBag className="size-5" />}
          title="Qobuz 商店专辑搜索"
          description="搜索 Qobuz 各地区商店的专辑信息。选择地区并输入关键词即可查询,点击专辑可打开官方商店页面,或一键推送到下载队列。"
        />

        {/* Search card */}
        <div className="rounded-2xl border bg-card p-5">
          {regionsLoading ? (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>正在加载商店可用地区...</span>
            </div>
          ) : regionsError ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4" />
                <span>{regionsError}</span>
              </div>
              <Button variant="outline" size="sm" className="w-fit rounded-xl" onClick={fetchRegions}>
                重试加载
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">商店地区</Label>
                <Select value={selectedRegion} onValueChange={updateSelectedRegion}>
                  <SelectTrigger className="h-10 w-48 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {REGION_CN_MAP[r.code] || `${r.label} (${r.country})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-52 flex-1 flex-col gap-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">搜索关键词</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="输入专辑名称、艺人..."
                    value={query}
                    onChange={(e) => updateQuery(e.target.value)}
                    className="h-10 rounded-xl pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={searching || !query.trim()}
                className="gradient-brand h-10 rounded-xl px-6 text-white hover:opacity-90"
              >
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {searching ? "搜索中..." : "搜索"}
              </Button>
            </form>
          )}
        </div>

        {pushNotice && (
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium",
              pushNotice.tone === "success"
                ? "border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] text-success"
                : "border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] bg-[var(--danger-soft)] text-destructive"
            )}
          >
            {pushNotice.tone === "success" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
            <span>{pushNotice.message}</span>
          </div>
        )}

        {/* Results */}
        {searching && (
          <div className="py-20 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-4 size-8 animate-spin opacity-50" />
            <div className="text-sm">正在请求 Qobuz 商店数据,请稍候...</div>
          </div>
        )}

        {searchError && (
          <div className="flex items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--destructive)_30%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4" />
            <div>
              <strong>搜索失败</strong>:{searchError}
            </div>
          </div>
        )}

        {!searching && !searchError && searchResult && (
          <div className="flex flex-col gap-4">
            <div className="text-xs text-muted-foreground">
              找到 {searchResult.albums.length} 个专辑结果 · 数据源:{" "}
              <a href={searchResult.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary">
                Qobuz Store <ExternalLink className="inline size-3 align-middle" />
              </a>
            </div>

            {searchResult.albums.length === 0 ? (
              <div className="rounded-2xl border bg-card py-20 text-center text-muted-foreground">
                <Disc className="mx-auto mb-3 size-9 opacity-20" />
                <div className="text-sm">未找到符合条件的专辑。</div>
                <div className="mt-1 text-xs">请尝试更换其他地区或修改搜索关键词。</div>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                {searchResult.albums.map((album) => {
                  const sampleRate = formatQobuzSampleRate(album.sampleRate);
                  const isPushing = pushingAlbumId === album.id;

                  return (
                    <a
                      key={album.id}
                      href={album.albumUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-float"
                    >
                      {/* Cover */}
                      <div className="relative aspect-square w-full bg-muted">
                        {album.coverUrl ? (
                          <img
                            src={album.coverUrl}
                            alt={album.title}
                            loading="lazy"
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                            <Music className="size-6 opacity-30" />
                            <span className="text-xs">暂无封面</span>
                          </div>
                        )}
                        {album.quality && (
                          <Badge className="glass-panel absolute bottom-2 right-2 rounded-full border-0 px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary">
                            {album.quality}
                          </Badge>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex flex-1 flex-col gap-1.5 p-3">
                        <span className="line-clamp-2 text-sm font-semibold leading-snug" title={album.title}>
                          {album.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground" title={album.artist}>
                          {album.artist || "未知艺人"}
                        </span>

                        <div className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                          {album.releaseDateDisplay && <span>发布: {album.releaseDateDisplay}</span>}
                          {album.trackCount && <span>曲目: {album.trackCount} 首</span>}
                          {(album.bitDepth || sampleRate) && (
                            <span className="font-medium text-primary">
                              {album.bitDepth && `${album.bitDepth} Bit`}
                              {album.bitDepth && sampleRate && " / "}
                              {sampleRate && `${sampleRate} kHz`}
                            </span>
                          )}
                        </div>

                        <div className="mt-auto flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                          <span>{album.genre || ""}</span>
                          {album.price && (
                            <span className="text-xs font-semibold text-foreground">
                              {album.currency || ""}
                              {album.price}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={Boolean(pushingAlbumId)}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handlePushDownload(album);
                          }}
                          className={cn(
                            "mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/8 px-2.5 py-2 text-xs font-semibold text-primary transition-colors",
                            "hover:bg-primary hover:text-primary-foreground",
                            pushingAlbumId && !isPushing && "cursor-not-allowed opacity-55",
                            isPushing && "cursor-wait"
                          )}
                        >
                          {isPushing ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                          <span>{isPushing ? "推送中..." : "一键推送"}</span>
                        </button>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
