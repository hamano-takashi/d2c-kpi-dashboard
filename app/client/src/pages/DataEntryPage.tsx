import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { kpi } from '../utils/api';
import { KpiMaster, KpiTarget, KpiActual, AGENT_LABELS, AGENT_ICONS } from '../types';

interface KpiWithValues extends KpiMaster {
  target_value: number;
  actual_value: number | null;
  achievement_rate: number | null;
  benchmark_status: 'valid' | 'warning' | 'danger' | null;
}

export default function DataEntryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [kpiMaster, setKpiMaster] = useState<KpiMaster[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [actuals, setActuals] = useState<KpiActual[]>([]);
  const [editedActuals, setEditedActuals] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>('COMMANDER');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    loadData();
  }, [projectId, year, month]);

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      let masterData: KpiMaster[] = [];
      let targetData: KpiTarget[] = [];
      let actualData: KpiActual[] = [];

      try {
        masterData = await kpi.getMaster();
      } catch (err) {
        console.error('Failed to load KPI master:', err);
        setError('KPIマスターデータの読み込みに失敗しました');
        setLoading(false);
        return;
      }

      try {
        targetData = await kpi.getTargets(projectId, year);
      } catch (err) {
        console.error('Failed to load targets:', err);
      }

      try {
        actualData = await kpi.getActuals(projectId, year, month);
      } catch (err) {
        console.error('Failed to load actuals:', err);
      }

      setKpiMaster(masterData);
      setTargets(targetData);
      setActuals(actualData);
      setEditedActuals(new Map());
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const agents = useMemo(() => {
    const agentSet = new Set(kpiMaster.map((k) => k.agent));
    return Array.from(agentSet);
  }, [kpiMaster]);

  const kpisWithValues: KpiWithValues[] = useMemo(() => {
    const targetMap = new Map(targets.map((t) => [t.kpi_id, t.target_value]));
    const actualMap = new Map(actuals.map((a) => [a.kpi_id, a.actual_value]));

    return kpiMaster
      .filter((k) => k.agent === selectedAgent)
      .map((k) => {
        const target = targetMap.get(k.id) ?? k.default_target;
        const actual = editedActuals.has(k.id)
          ? editedActuals.get(k.id)!
          : actualMap.get(k.id) ?? null;
        const rate = target && actual !== null ? Math.round((actual / target) * 100) : null;

        let benchmarkStatus: 'valid' | 'warning' | 'danger' | null = null;
        if (target !== null && k.benchmark_min !== null && k.benchmark_max !== null) {
          if (target < k.benchmark_min) benchmarkStatus = 'warning';
          else if (target > k.benchmark_max) benchmarkStatus = 'danger';
          else benchmarkStatus = 'valid';
        }

        return {
          ...k,
          target_value: target,
          actual_value: actual,
          achievement_rate: rate,
          benchmark_status: benchmarkStatus,
        };
      });
  }, [kpiMaster, targets, actuals, editedActuals, selectedAgent]);

  const categories = useMemo(() => {
    const categorySet = new Set(kpisWithValues.map((k) => k.category));
    return Array.from(categorySet);
  }, [kpisWithValues]);

  const handleActualChange = (kpiId: string, value: string) => {
    const numValue = value === '' ? NaN : Number(value);
    setEditedActuals((prev) => {
      const next = new Map(prev);
      if (isNaN(numValue)) {
        next.delete(kpiId);
      } else {
        next.set(kpiId, numValue);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!projectId || editedActuals.size === 0) return;

    setSaving(true);
    setMessage(null);

    try {
      const actualsToSave = Array.from(editedActuals.entries()).map(([kpi_id, actual_value]) => ({
        kpi_id,
        actual_value,
        year,
        month,
      }));

      await kpi.setActuals(projectId, actualsToSave);

      // 更新されたデータを再取得
      const actualData = await kpi.getActuals(projectId, year, month);
      setActuals(actualData);
      setEditedActuals(new Map());
      setMessage({ type: 'success', text: '実績値を保存しました' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const formatValue = (value: number | null, unit: string): string => {
    if (value === null) return '-';
    if (unit === '円') {
      if (value >= 100000000) return `${(value / 100000000).toFixed(1)}億`;
      if (value >= 10000) return `${(value / 10000).toFixed(0)}万`;
      return value.toLocaleString();
    }
    return `${value}${unit}`;
  };

  const getBenchmarkLabel = (status: 'valid' | 'warning' | 'danger' | null): JSX.Element | null => {
    switch (status) {
      case 'valid':
        return <span className="badge badge-success">妥当</span>;
      case 'warning':
        return <span className="badge badge-warning">要検討</span>;
      case 'danger':
        return <span className="badge badge-danger">非現実的</span>;
      default:
        return null;
    }
  };

  const getAchievementBadge = (rate: number | null): JSX.Element => {
    if (rate === null) return <span className="badge badge-info">未入力</span>;
    if (rate >= 100) return <span className="badge badge-success">{rate}%</span>;
    if (rate >= 70) return <span className="badge badge-warning">{rate}%</span>;
    return <span className="badge badge-danger">{rate}%</span>;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="header">
          <h1>実績入力</h1>
        </div>
        <div className="card text-center" style={{ padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}>エラー</h2>
          <p className="text-gray mb-4">{error}</p>
          <button onClick={() => loadData()} className="btn btn-primary">
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>実績入力</h1>
        <div className="header-actions">
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            className="btn btn-primary"
            disabled={saving || editedActuals.size === 0}
          >
            {saving ? '保存中...' : `保存 (${editedActuals.size}件)`}
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type} mb-4`}>
          {message.text}
        </div>
      )}

      {/* エージェントタブ */}
      <div className="tabs">
        {agents.map((agent) => (
          <div
            key={agent}
            className={`tab ${selectedAgent === agent ? 'active' : ''}`}
            onClick={() => setSelectedAgent(agent)}
          >
            {AGENT_ICONS[agent]} {AGENT_LABELS[agent]}
          </div>
        ))}
      </div>

      {/* カテゴリ別入力フォーム */}
      {categories.map((category) => {
        const categoryKpis = kpisWithValues.filter((k) => k.category === category);
        return (
          <div key={category} className="card mb-4">
            <h3 className="card-title mb-3">{category}</h3>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>KPI</th>
                  <th style={{ width: '15%' }}>目標値</th>
                  <th style={{ width: '15%' }}>現実性</th>
                  <th style={{ width: '20%' }}>実績値</th>
                  <th style={{ width: '10%' }}>達成率</th>
                  <th style={{ width: '15%' }}>ベンチマーク</th>
                </tr>
              </thead>
              <tbody>
                {categoryKpis.map((kpiItem) => (
                  <tr key={kpiItem.id}>
                    <td>
                      <div>{kpiItem.name}</div>
                      <div className="text-xs text-gray">Level {kpiItem.level}</div>
                    </td>
                    <td>{formatValue(kpiItem.target_value, kpiItem.unit)}</td>
                    <td>{getBenchmarkLabel(kpiItem.benchmark_status)}</td>
                    <td>
                      <div className="flex gap-2" style={{ alignItems: 'center' }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '120px' }}
                          value={
                            editedActuals.has(kpiItem.id)
                              ? editedActuals.get(kpiItem.id)
                              : kpiItem.actual_value ?? ''
                          }
                          onChange={(e) => handleActualChange(kpiItem.id, e.target.value)}
                          placeholder="入力"
                        />
                        <span className="text-sm text-gray">{kpiItem.unit}</span>
                      </div>
                    </td>
                    <td>{getAchievementBadge(kpiItem.achievement_rate)}</td>
                    <td>
                      <div className="text-xs text-gray">
                        {formatValue(kpiItem.benchmark_min, kpiItem.unit)} 〜{' '}
                        {formatValue(kpiItem.benchmark_max, kpiItem.unit)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
