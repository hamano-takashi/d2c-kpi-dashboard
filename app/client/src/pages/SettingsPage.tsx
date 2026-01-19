import { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { kpi, dataIO } from '../utils/api';
import { Project, User, KpiMaster } from '../types';

interface ContextType {
  project: Project;
  user: User;
}

export default function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useOutletContext<ContextType>();
  const [kpiMaster, setKpiMaster] = useState<KpiMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [initializingTargets, setInitializingTargets] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadKpiMaster();
  }, []);

  const loadKpiMaster = async () => {
    try {
      const data = await kpi.getMaster();
      setKpiMaster(data);
    } catch (err) {
      console.error('Failed to load KPI master:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!projectId) return;
    setExporting(true);
    setMessage(null);

    try {
      const data = await dataIO.export(projectId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'データをエクスポートしました' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'エクスポートに失敗しました' });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!projectId || !e.target.files?.[0]) return;

    const file = e.target.files[0];
    setImporting(true);
    setMessage(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      await dataIO.import(projectId, {
        targets: data.targets || [],
        actuals: data.actuals || [],
      });

      setMessage({ type: 'success', text: 'データをインポートしました' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'インポートに失敗しました' });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleInitializeTargets = async () => {
    if (!projectId) return;
    if (!confirm(`${year}年の目標値をデフォルト値で初期化しますか？既存の目標値は上書きされます。`)) return;

    setInitializingTargets(true);
    setMessage(null);

    try {
      const targets = kpiMaster.map((k) => ({
        kpi_id: k.id,
        target_value: k.default_target,
        year,
      }));

      await kpi.setTargets(projectId, targets);
      setMessage({ type: 'success', text: `${year}年の目標値を初期化しました（${targets.length}件）` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '初期化に失敗しました' });
    } finally {
      setInitializingTargets(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>設定</h1>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      <div className="grid grid-2">
        {/* プロジェクト情報 */}
        <div className="card">
          <h3 className="card-title mb-3">プロジェクト情報</h3>
          <div className="form-group">
            <label className="form-label">プロジェクト名</label>
            <input
              type="text"
              className="form-input"
              value={project.name}
              disabled
            />
          </div>
          <div className="form-group">
            <label className="form-label">オーナー</label>
            <input
              type="text"
              className="form-input"
              value={project.owner_name}
              disabled
            />
          </div>
          <div className="form-group">
            <label className="form-label">作成日</label>
            <input
              type="text"
              className="form-input"
              value={new Date(project.created_at).toLocaleDateString('ja-JP')}
              disabled
            />
          </div>
        </div>

        {/* 目標値初期化 */}
        <div className="card">
          <h3 className="card-title mb-3">目標値の初期化</h3>
          <p className="text-sm text-gray mb-3">
            KPIマスターのデフォルト値を使用して、指定年の目標値を一括設定します。
            13億円達成に向けたベンチマーク値が設定されます。
          </p>
          <div className="flex gap-2 mb-3" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">対象年</label>
              <select
                className="form-select"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {[2024, 2025, 2026].map((y) => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInitializeTargets}
              className="btn btn-primary"
              disabled={initializingTargets}
            >
              {initializingTargets ? '初期化中...' : '目標値を初期化'}
            </button>
          </div>
          <p className="text-xs text-gray">
            ※ {kpiMaster.length}件のKPIに目標値が設定されます
          </p>
        </div>

        {/* データエクスポート */}
        <div className="card">
          <h3 className="card-title mb-3">データエクスポート</h3>
          <p className="text-sm text-gray mb-3">
            プロジェクトのすべてのデータ（目標値、実績値）をJSONファイルとしてエクスポートします。
            バックアップやチーム間のデータ共有に使用できます。
          </p>
          <button
            onClick={handleExport}
            className="btn btn-primary"
            disabled={exporting}
          >
            {exporting ? 'エクスポート中...' : 'JSONファイルをダウンロード'}
          </button>
        </div>

        {/* データインポート */}
        <div className="card">
          <h3 className="card-title mb-3">データインポート</h3>
          <p className="text-sm text-gray mb-3">
            エクスポートしたJSONファイルからデータをインポートします。
            既存のデータは上書きされます。
          </p>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            {importing ? 'インポート中...' : 'JSONファイルを選択'}
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* KPIマスター情報 */}
      <div className="card mt-4">
        <h3 className="card-title mb-3">KPIマスター情報</h3>
        <div className="grid grid-3 gap-2">
          {['COMMANDER', 'ACQUISITION', 'CREATIVE', 'INSIGHT', 'ENGAGEMENT', 'OPERATIONS'].map((agent) => {
            const agentKpis = kpiMaster.filter((k) => k.agent === agent);
            const categories = [...new Set(agentKpis.map((k) => k.category))];
            return (
              <div key={agent} style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  {agent === 'COMMANDER' && '🎯 戦略'}
                  {agent === 'ACQUISITION' && '📈 集客'}
                  {agent === 'CREATIVE' && '✏️ 制作'}
                  {agent === 'INSIGHT' && '📊 分析'}
                  {agent === 'ENGAGEMENT' && '💌 顧客'}
                  {agent === 'OPERATIONS' && '⚙️ 運用'}
                </h4>
                <div className="text-sm text-gray mb-2">{agentKpis.length} KPI</div>
                <div className="text-xs text-gray">
                  カテゴリ: {categories.join(', ')}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-center text-gray">
          合計 {kpiMaster.length} KPI
        </div>
      </div>
    </div>
  );
}
