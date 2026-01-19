import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { kpi } from '../utils/api';
import { Summary, AGENT_LABELS, AGENT_ICONS } from '../types';

export default function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    loadSummary();
  }, [projectId, year, month]);

  const loadSummary = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await kpi.getSummary(projectId, year, month);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: number | null, unit: string): string => {
    if (value === null) return '-';
    if (unit === '円') {
      if (value >= 100000000) return `${(value / 100000000).toFixed(1)}億`;
      if (value >= 10000) return `${(value / 10000).toFixed(0)}万`;
      return value.toLocaleString();
    }
    if (unit === '%' || unit === '倍' || unit === '点') {
      return `${value}${unit}`;
    }
    return value.toLocaleString();
  };

  const getAchievementRate = (actual: number | null, target: number | null): number => {
    if (actual === null || target === null || target === 0) return 0;
    return Math.round((actual / target) * 100);
  };

  const getProgressClass = (rate: number): string => {
    if (rate >= 100) return 'progress-success';
    if (rate >= 70) return 'progress-warning';
    return 'progress-danger';
  };

  const getBadgeClass = (rate: number): string => {
    if (rate >= 100) return 'badge-success';
    if (rate >= 70) return 'badge-warning';
    return 'badge-danger';
  };

  const radarData = summary?.agentScores.map((score) => ({
    agent: AGENT_LABELS[score.agent] || score.agent,
    score: score.total > 0 ? Math.round((score.achieved / score.total) * 100) : 0,
    fullMark: 100,
  })) || [];

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
        <h1>サマリー</h1>
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
        </div>
      </div>

      {/* KGI カード */}
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>KGI達成状況</h2>
      <div className="grid grid-4 mb-4">
        {summary?.kgis.map((kgi) => {
          const rate = getAchievementRate(kgi.actual_value, kgi.target_value);
          return (
            <div key={kgi.id} className="kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-card-label">{kgi.name}</span>
                <span className={`badge ${getBadgeClass(rate)}`}>{rate}%</span>
              </div>
              <div className="kpi-card-value">
                {formatValue(kgi.actual_value, kgi.unit)}
              </div>
              <div className="kpi-card-target">
                目標: {formatValue(kgi.target_value, kgi.unit)}
              </div>
              <div className="kpi-card-progress">
                <div
                  className={`kpi-card-progress-bar ${getProgressClass(rate)}`}
                  style={{ width: `${Math.min(rate, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-2 mb-4">
        {/* エージェント別スコア */}
        <div className="card">
          <h3 className="card-title mb-3">エージェント別達成状況</h3>
          <div className="grid grid-2 gap-2">
            {summary?.agentScores.map((score) => {
              const rate = score.total > 0 ? Math.round((score.achieved / score.total) * 100) : 0;
              return (
                <div
                  key={score.agent}
                  style={{
                    padding: '1rem',
                    background: 'var(--gray-50)',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div className="flex-between mb-2">
                    <span style={{ fontSize: '1.25rem' }}>
                      {AGENT_ICONS[score.agent]} {AGENT_LABELS[score.agent]}
                    </span>
                    <span className={`badge ${getBadgeClass(rate)}`}>{rate}%</span>
                  </div>
                  <div className="text-sm text-gray">
                    {score.achieved} / {score.total} 項目達成
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* レーダーチャート */}
        <div className="card">
          <h3 className="card-title mb-3">バランスチャート</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="agent" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  name="達成率"
                  dataKey="score"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* アラート */}
      <div className="card">
        <h3 className="card-title mb-3">要注意項目（達成率70%未満）</h3>
        {summary?.alerts && summary.alerts.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>エージェント</th>
                <th>KPI</th>
                <th>実績</th>
                <th>目標</th>
                <th>達成率</th>
              </tr>
            </thead>
            <tbody>
              {summary.alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <span style={{ marginRight: '0.5rem' }}>{AGENT_ICONS[alert.agent]}</span>
                    {AGENT_LABELS[alert.agent]}
                  </td>
                  <td>{alert.name}</td>
                  <td>{formatValue(alert.actual_value, alert.unit)}</td>
                  <td>{formatValue(alert.target_value, alert.unit)}</td>
                  <td>
                    <span className="badge badge-danger">{alert.achievement_rate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center text-gray" style={{ padding: '2rem' }}>
            達成率70%未満の項目はありません
          </div>
        )}
      </div>
    </div>
  );
}
