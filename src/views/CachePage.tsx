import React from "react";
import { adminApiClient, apiClient, downloadProxyFile } from "../api/client";
import { DownloadCacheItem, DownloadCacheSummary } from "../api/types";
import { useApp } from "../context/AppContext";
import { Download, HardDriveDownload, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

const formatBytes = (bytes?: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const statusLabel = (item: DownloadCacheItem) => {
  if (item.serverFileExists) return "服务器已缓存";
  if (item.status === "downloading" || item.status === "queued") return "正在下载到服务器";
  if (item.status === "paused") return "已暂停";
  if (item.status === "failed") return "下载失败";
  if (item.status === "expired") return "服务器缓存已清理";
  return "未缓存";
};

export const CachePage: React.FC = () => {
  const { bots, updateSettings } = useApp();
  const [summary, setSummary] = React.useState<DownloadCacheSummary | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [cleanupInterval, setCleanupInterval] = React.useState(0);

  const loadCache = React.useCallback(async () => {
    const next = await adminApiClient.getDownloadCache();
    setSummary(next);
    setCleanupInterval(next.cleanupIntervalHours);
  }, []);

  React.useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadCache().catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : String(error));
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadCache]);

  const runAction = async (key: string, action: () => Promise<void>, successMessage: string) => {
    try {
      setBusyKey(key);
      setNotice(null);
      await action();
      await loadCache();
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handleClearAll = () => {
    const confirmed = window.confirm("确认删除服务器上的所有本地下载缓存？消息和文件记录会保留。");
    if (!confirmed) return;
    void runAction("all", async () => {
      await adminApiClient.clearDownloadCache();
    }, "已清理所有本地下载缓存。");
  };

  const handleClearFile = (item: DownloadCacheItem) => {
    void runAction(`clear:${item.fileId}`, async () => {
      await adminApiClient.clearDownloadCacheFile(item.fileId);
    }, "已清理该文件的服务器缓存。");
  };

  const handleRefetch = (item: DownloadCacheItem) => {
    void runAction(`fetch:${item.id}`, async () => {
      await apiClient.triggerDownload(item.fileId, item.messageId, item.fileName, item.sizeBytes);
    }, "已提交重新下载任务。");
  };

  const handleBrowserDownload = (item: DownloadCacheItem) => {
    if (!item.proxyUrl) return;
    void runAction(`browser:${item.id}`, async () => {
      await downloadProxyFile(item.proxyUrl!, item.fileName);
    }, "浏览器下载已触发。");
  };

  const handleCleanupIntervalSave = () => {
    void runAction("interval", async () => {
      await updateSettings({ cacheCleanupIntervalHours: cleanupInterval });
    }, "缓存定时清理设置已保存。");
  };

  const botTitle = (botId?: string) => bots.find((bot) => bot.id === botId)?.title || botId || "-";
  const items = summary?.items || [];

  return (
    <div className="cache-page">
      <div className="cache-header">
        <div>
          <h1>
            <HardDriveDownload size={20} />
            <span>本地下载缓存</span>
          </h1>
          <p>服务器代理缓存与文件历史状态。</p>
        </div>
        <button className="btn-secondary" onClick={() => void loadCache()} disabled={busyKey !== null}>
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {notice && <div className="cache-notice">{notice}</div>}

      <div className="cache-summary-grid">
        <section className="settings-card cache-summary-card">
          <div className="settings-card-title">缓存占用</div>
          <div className="cache-metric">
            <strong>{formatBytes(summary?.totalCachedBytes)}</strong>
            <span>{summary?.totalCachedFiles || 0} 个服务器缓存文件</span>
          </div>
        </section>

        <section className="settings-card cache-summary-card">
          <div className="settings-card-title">定时清理</div>
          <div className="cache-interval-row">
            <select
              className="settings-input"
              value={cleanupInterval}
              onChange={(event) => setCleanupInterval(Number(event.target.value))}
            >
              <option value={0}>关闭</option>
              <option value={6}>每 6 小时</option>
              <option value={12}>每 12 小时</option>
              <option value={24}>每天</option>
              <option value={72}>每 3 天</option>
              <option value={168}>每 7 天</option>
            </select>
            <button className="btn-secondary" onClick={handleCleanupIntervalSave} disabled={busyKey === "interval"}>
              保存
            </button>
          </div>
        </section>

        <section className="settings-card cache-summary-card">
          <div className="settings-card-title">清理操作</div>
          <button className="btn-secondary danger-button" onClick={handleClearAll} disabled={busyKey === "all"}>
            <Trash2 size={14} />
            一键清理全部缓存
          </button>
        </section>
      </div>

      <section className="cache-table-wrap">
        <div className="cache-table-header">
          <strong>缓存文件明细</strong>
          <span>{items.length} 条记录</span>
        </div>

        {items.length === 0 ? (
          <div className="cache-empty">还没有文件记录。</div>
        ) : (
          <table className="cache-table">
            <thead>
              <tr>
                <th>文件</th>
                <th>机器人</th>
                <th>状态</th>
                <th>服务器缓存</th>
                <th>原始大小</th>
                <th>更新时间</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.id}:${item.fileId}`}>
                  <td>
                    <div className="cache-file-cell">
                      <strong>{item.fileName || item.fileId}</strong>
                      <span>{item.mimeType || "application/octet-stream"}</span>
                    </div>
                  </td>
                  <td>{botTitle(item.botId)}</td>
                  <td>{statusLabel(item)}</td>
                  <td>{item.serverFileExists ? formatBytes(item.cachedBytes) : "不存在"}</td>
                  <td>{formatBytes(item.sizeBytes)}</td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="cache-actions">
                      {item.serverFileExists ? (
                        <button
                          className="icon-button"
                          onClick={() => handleBrowserDownload(item)}
                          disabled={busyKey === `browser:${item.id}`}
                          title="下载到本机"
                        >
                          <Download size={14} />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          onClick={() => handleRefetch(item)}
                          disabled={busyKey === `fetch:${item.id}`}
                          title="重新下载到服务器"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        className="icon-button danger-button"
                        onClick={() => handleClearFile(item)}
                        disabled={!item.serverFileExists || busyKey === `clear:${item.fileId}`}
                        title="清理该文件缓存"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
