import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { kpi } from '../utils/api';
import { KpiMaster, KpiTarget, KpiActual } from '../types';

interface TreeNode extends KpiMaster {
  children: TreeNode[];
  target_value?: number;
  actual_value?: number;
  achievement_rate?: number;
}

interface NewKpiForm {
  id: string;
  category: string;
  name: string;
  unit: string;
  default_target: number;
  benchmark_min: number;
  benchmark_max: number;
  level: number;
  parent_kpi_id: string;
  description: string;
}

const INITIAL_KPI_FORM: NewKpiForm = {
  id: '',
  category: '',
  name: '',
  unit: '',
  default_target: 0,
  benchmark_min: 0,
  benchmark_max: 0,
  level: 3,
  parent_kpi_id: '',
  description: '',
};

export default function KpiTreePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [kpiMaster, setKpiMaster] = useState<KpiMaster[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [actuals, setActuals] = useState<KpiActual[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKpi, setNewKpi] = useState<NewKpiForm>(INITIAL_KPI_FORM);
  const [saving, setSaving] = useState(false);
  // 編集用のstate
  const [editTarget, setEditTarget] = useState<string>('');
  const [editActual, setEditActual] = useState<string>('');
  const [savingValues, setSavingValues] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId, year, month]);

  // 選択ノードが変わったら編集値を更新
  useEffect(() => {
    if (selectedNode) {
      setEditTarget(selectedNode.target_value?.toString() || '');
      setEditActual(selectedNode.actual_value?.toString() || '');
    }
  }, [selectedNode?.id]);

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [masterData, targetData, actualData] = await Promise.all([
        kpi.getMaster(),
        kpi.getTargets(projectId, year),
        kpi.getActuals(projectId, year, month),
      ]);
      setKpiMaster(masterData);
      setTargets(targetData);
      setActuals(actualData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Level 2のKPI（主要ドライバー）を取得
  const drivers = useMemo(() => {
    return kpiMaster.filter((k) => k.level === 2);
  }, [kpiMaster]);

  const buildTree = useMemo((): TreeNode[] => {
    const targetMap = new Map(targets.map((t) => [t.kpi_id, t.target_value]));
    const actualMap = new Map(actuals.map((a) => [a.kpi_id, a.actual_value]));

    // フィルタリング: 選択したドライバーとその子孫のみ表示
    let filteredKpis: KpiMaster[];
    if (selectedDriver === 'all') {
      filteredKpis = kpiMaster;
    } else {
      // 選択したドライバーとその子孫を取得
      const selectedIds = new Set<string>();
      const addDescendants = (parentId: string) => {
        selectedIds.add(parentId);
        kpiMaster.filter(k => k.parent_kpi_id === parentId).forEach(child => {
          addDescendants(child.id);
        });
      };
      addDescendants(selectedDriver);
      // KGIも含める
      const kgi = kpiMaster.find(k => k.level === 1);
      if (kgi) selectedIds.add(kgi.id);
      filteredKpis = kpiMaster.filter(k => selectedIds.has(k.id));
    }

    const nodesWithData: TreeNode[] = filteredKpis.map((k) => {
      const target = targetMap.get(k.id) ?? k.default_target;
      const actual = actualMap.get(k.id);
      const rate = target && actual ? Math.round((actual / target) * 100) : undefined;

      return {
        ...k,
        children: [],
        target_value: target,
        actual_value: actual ?? undefined,
        achievement_rate: rate,
      };
    });

    const nodeMap = new Map(nodesWithData.map((n) => [n.id, n]));

    // Build tree structure
    const roots: TreeNode[] = [];
    nodesWithData.forEach((node) => {
      if (node.parent_kpi_id && nodeMap.has(node.parent_kpi_id)) {
        nodeMap.get(node.parent_kpi_id)!.children.push(node);
      } else if (node.level === 1) {
        roots.push(node);
      }
    });

    return roots;
  }, [kpiMaster, targets, actuals, selectedDriver]);

  const formatValue = (value: number | undefined, unit: string): string => {
    if (value === undefined) return '-';
    if (unit === '円') {
      if (value >= 100000000) return `${(value / 100000000).toFixed(1)}億`;
      if (value >= 10000) return `${(value / 10000).toFixed(0)}万`;
      return value.toLocaleString();
    }
    if (unit === 'セッション' || unit === 'クリック' || unit === '人') {
      if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
      return value.toLocaleString();
    }
    return `${value}${unit}`;
  };

  const getStatusColor = (rate: number | undefined): string => {
    if (rate === undefined) return '#9ca3af';
    if (rate >= 100) return '#10b981';
    if (rate >= 70) return '#f59e0b';
    return '#ef4444';
  };

  const getStatusBg = (rate: number | undefined): string => {
    if (rate === undefined) return '#f3f4f6';
    if (rate >= 100) return '#d1fae5';
    if (rate >= 70) return '#fef3c7';
    return '#fee2e2';
  };

  const handleAddKpi = async () => {
    if (!newKpi.id || !newKpi.name || !newKpi.parent_kpi_id) {
      alert('ID、名前、親KPIは必須です');
      return;
    }

    // 親KPIからagentを継承
    const parentKpi = kpiMaster.find(k => k.id === newKpi.parent_kpi_id);
    const agent = parentKpi?.agent || 'COMMANDER';

    setSaving(true);
    try {
      await kpi.addKpi({
        ...newKpi,
        agent,
        parent_kpi_id: newKpi.parent_kpi_id || null,
      });
      setShowAddModal(false);
      setNewKpi(INITIAL_KPI_FORM);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'KPI追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKpi = async (kpiId: string) => {
    if (!confirm('このKPIを削除しますか？')) return;

    try {
      await kpi.deleteKpi(kpiId);
      setSelectedNode(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'KPI削除に失敗しました');
    }
  };

  // 目標値・実績値を保存
  const handleSaveValues = async () => {
    if (!projectId || !selectedNode) return;

    setSavingValues(true);
    try {
      const targetValue = editTarget ? Number(editTarget) : null;
      const actualValue = editActual ? Number(editActual) : null;

      // 目標値を保存
      if (targetValue !== null) {
        await kpi.setTargets(projectId, [{
          kpi_id: selectedNode.id,
          target_value: targetValue,
          year,
          month: null, // 年間目標として保存
        }]);
      }

      // 実績値を保存
      if (actualValue !== null) {
        await kpi.setActuals(projectId, [{
          kpi_id: selectedNode.id,
          actual_value: actualValue,
          year,
          month,
        }]);
      }

      await loadData();
      // 選択ノードを更新するため、再選択
      const updatedNode = kpiMaster.find(k => k.id === selectedNode.id);
      if (updatedNode) {
        // buildTreeから最新のノードを取得
      }
    } catch (err: any) {
      alert(err.message || '保存に失敗しました');
    } finally {
      setSavingValues(false);
    }
  };

  // ツリーノードコンポーネント
  const TreeNodeComponent = ({ node, isRoot = false }: { node: TreeNode; isRoot?: boolean }) => {
    const hasChildren = node.children.length > 0;
    const statusColor = getStatusColor(node.achievement_rate);
    const statusBg = getStatusBg(node.achievement_rate);

    return (
      <div className="tree-node-wrapper">
        {/* ノード本体 */}
        <div
          className={`tree-node ${isRoot ? 'tree-node-root' : ''} ${selectedNode?.id === node.id ? 'tree-node-selected' : ''}`}
          style={{
            borderColor: statusColor,
            backgroundColor: statusBg,
          }}
          onClick={() => setSelectedNode(node)}
        >
          <div className="tree-node-header">
            <span className="tree-node-name">{node.name}</span>
          </div>
          <div className="tree-node-metrics">
            <div className="tree-node-metric">
              <span className="tree-node-metric-label">目標</span>
              <span className="tree-node-metric-value">
                {formatValue(node.target_value, node.unit)}
              </span>
            </div>
            <div className="tree-node-metric">
              <span className="tree-node-metric-label">実績</span>
              <span className="tree-node-metric-value">
                {node.actual_value !== undefined ? formatValue(node.actual_value, node.unit) : '-'}
              </span>
            </div>
            <div className="tree-node-metric">
              <span className="tree-node-metric-label">達成率</span>
              <span className="tree-node-metric-value" style={{ color: statusColor, fontWeight: 'bold' }}>
                {node.achievement_rate !== undefined ? `${node.achievement_rate}%` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* 子ノード */}
        {hasChildren && (
          <div className="tree-children">
            <div className="tree-line-vertical"></div>
            <div className="tree-children-container">
              {node.children.map((child) => (
                <div key={child.id} className="tree-child-wrapper">
                  <div className="tree-line-horizontal"></div>
                  <TreeNodeComponent node={child} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
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
        <h1>KPIツリー</h1>
        <div className="header-actions">
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
          >
            <option value="all">全体表示</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
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
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            + KPI追加
          </button>
        </div>
      </div>

      <div className={`tree-container ${selectedNode ? 'has-panel' : ''}`}>
        {/* ツリー表示エリア */}
        <div className="tree-scroll-area">
          <div className="tree-content">
            {buildTree.length > 0 ? (
              <div className="tree-roots">
                {buildTree.map((node) => (
                  <TreeNodeComponent key={node.id} node={node} isRoot />
                ))}
              </div>
            ) : (
              <div className="text-center text-gray" style={{ padding: '2rem' }}>
                該当するKPIがありません
              </div>
            )}
          </div>
        </div>

        {/* 詳細パネル */}
        {selectedNode && (
          <div className="tree-detail-panel">
            <div className="tree-detail-header">
              <h3>{selectedNode.name}</h3>
              <button
                className="tree-detail-close"
                onClick={() => setSelectedNode(null)}
              >
                ×
              </button>
            </div>
            <div className="tree-detail-content">
              {/* KPI説明 */}
              {selectedNode.description && (
                <>
                  <div className="tree-detail-description">
                    {selectedNode.description}
                  </div>
                  <div className="tree-detail-divider"></div>
                </>
              )}

              {/* 基本情報 */}
              <div className="tree-detail-row">
                <span className="tree-detail-label">カテゴリ</span>
                <span>{selectedNode.category}</span>
              </div>
              <div className="tree-detail-row">
                <span className="tree-detail-label">階層レベル</span>
                <span>Level {selectedNode.level}</span>
              </div>
              <div className="tree-detail-row">
                <span className="tree-detail-label">単位</span>
                <span>{selectedNode.unit}</span>
              </div>

              <div className="tree-detail-divider"></div>

              {/* 数値入力 */}
              <div className="tree-detail-section-title">
                データ入力（{year}年{month}月）
              </div>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  目標値（{selectedNode.unit}）
                </label>
                <input
                  type="number"
                  className="form-input"
                  style={{ padding: '0.5rem' }}
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                  placeholder={`デフォルト: ${selectedNode.default_target}`}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  実績値（{selectedNode.unit}）
                </label>
                <input
                  type="number"
                  className="form-input"
                  style={{ padding: '0.5rem' }}
                  value={editActual}
                  onChange={(e) => setEditActual(e.target.value)}
                  placeholder="実績を入力"
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginBottom: '0.5rem' }}
                onClick={handleSaveValues}
                disabled={savingValues}
              >
                {savingValues ? '保存中...' : '保存'}
              </button>

              {/* 達成状況 */}
              <div className="tree-detail-row" style={{ marginTop: '0.5rem' }}>
                <span className="tree-detail-label">達成率</span>
                <span
                  className="tree-detail-value"
                  style={{
                    color: getStatusColor(selectedNode.achievement_rate),
                    fontWeight: 'bold'
                  }}
                >
                  {selectedNode.achievement_rate !== undefined
                    ? `${selectedNode.achievement_rate}%`
                    : '未入力'}
                </span>
              </div>

              <div className="tree-detail-divider"></div>

              {/* ベンチマーク */}
              <div className="tree-detail-section-title">ベンチマーク（業界目安）</div>
              <div className="tree-detail-row">
                <span className="tree-detail-label">最小値</span>
                <span className="text-sm">
                  {formatValue(selectedNode.benchmark_min, selectedNode.unit)}
                </span>
              </div>
              <div className="tree-detail-row">
                <span className="tree-detail-label">最大値</span>
                <span className="text-sm">
                  {formatValue(selectedNode.benchmark_max, selectedNode.unit)}
                </span>
              </div>
              <div className="tree-detail-row">
                <span className="tree-detail-label">デフォルト目標</span>
                <span className="text-sm">
                  {formatValue(selectedNode.default_target, selectedNode.unit)}
                </span>
              </div>

              {/* 関連KPI */}
              {selectedNode.children.length > 0 && (
                <>
                  <div className="tree-detail-divider"></div>
                  <div className="tree-detail-section-title">下位KPI（{selectedNode.children.length}件）</div>
                  <div className="tree-detail-children">
                    {selectedNode.children.map((child) => (
                      <div
                        key={child.id}
                        className="tree-detail-child"
                        onClick={() => setSelectedNode(child)}
                      >
                        <span>{child.name}</span>
                        <span style={{ color: getStatusColor(child.achievement_rate) }}>
                          {child.achievement_rate !== undefined ? `${child.achievement_rate}%` : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* 削除ボタン（Level 3以上のみ） */}
              {selectedNode.level >= 3 && (
                <>
                  <div className="tree-detail-divider"></div>
                  <button
                    className="btn btn-danger btn-sm"
                    style={{ width: '100%' }}
                    onClick={() => handleDeleteKpi(selectedNode.id)}
                  >
                    このKPIを削除
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 凡例 */}
      <div className="card mt-4">
        <h3 className="card-title mb-3">凡例</h3>
        <div className="flex gap-4">
          <div className="flex gap-2" style={{ alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, background: '#d1fae5', border: '2px solid #10b981', borderRadius: 4 }} />
            <span className="text-sm">達成（100%以上）</span>
          </div>
          <div className="flex gap-2" style={{ alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 4 }} />
            <span className="text-sm">順調（70%以上）</span>
          </div>
          <div className="flex gap-2" style={{ alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, background: '#fee2e2', border: '2px solid #ef4444', borderRadius: 4 }} />
            <span className="text-sm">要改善（70%未満）</span>
          </div>
          <div className="flex gap-2" style={{ alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, background: '#f3f4f6', border: '2px solid #9ca3af', borderRadius: 4 }} />
            <span className="text-sm">未入力</span>
          </div>
        </div>
      </div>

      {/* KPI追加モーダル */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 className="modal-title">KPIを追加</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="form-group">
              <label className="form-label">KPI ID（英数字、ユニーク）</label>
              <input
                type="text"
                className="form-input"
                value={newKpi.id}
                onChange={(e) => setNewKpi({ ...newKpi, id: e.target.value })}
                placeholder="custom_001"
              />
            </div>
            <div className="form-group">
              <label className="form-label">KPI名</label>
              <input
                type="text"
                className="form-input"
                value={newKpi.name}
                onChange={(e) => setNewKpi({ ...newKpi, name: e.target.value })}
                placeholder="カスタムKPI"
              />
            </div>
            <div className="form-group">
              <label className="form-label">親KPI</label>
              <select
                className="form-select"
                value={newKpi.parent_kpi_id}
                onChange={(e) => {
                  const parent = kpiMaster.find(k => k.id === e.target.value);
                  setNewKpi({
                    ...newKpi,
                    parent_kpi_id: e.target.value,
                    level: parent ? parent.level + 1 : 3
                  });
                }}
              >
                <option value="">選択してください</option>
                {kpiMaster.filter(k => k.level >= 2).map((k) => (
                  <option key={k.id} value={k.id}>
                    {'　'.repeat(k.level - 2)}{k.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-2 gap-3">
              <div className="form-group">
                <label className="form-label">カテゴリ</label>
                <input
                  type="text"
                  className="form-input"
                  value={newKpi.category}
                  onChange={(e) => setNewKpi({ ...newKpi, category: e.target.value })}
                  placeholder="カスタム"
                />
              </div>
              <div className="form-group">
                <label className="form-label">単位</label>
                <input
                  type="text"
                  className="form-input"
                  value={newKpi.unit}
                  onChange={(e) => setNewKpi({ ...newKpi, unit: e.target.value })}
                  placeholder="円、%、件など"
                />
              </div>
            </div>
            <div className="grid grid-3 gap-3">
              <div className="form-group">
                <label className="form-label">デフォルト目標</label>
                <input
                  type="number"
                  className="form-input"
                  value={newKpi.default_target}
                  onChange={(e) => setNewKpi({ ...newKpi, default_target: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">ベンチマーク最小</label>
                <input
                  type="number"
                  className="form-input"
                  value={newKpi.benchmark_min}
                  onChange={(e) => setNewKpi({ ...newKpi, benchmark_min: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">ベンチマーク最大</label>
                <input
                  type="number"
                  className="form-input"
                  value={newKpi.benchmark_max}
                  onChange={(e) => setNewKpi({ ...newKpi, benchmark_max: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">説明</label>
              <textarea
                className="form-input"
                rows={2}
                value={newKpi.description}
                onChange={(e) => setNewKpi({ ...newKpi, description: e.target.value })}
                placeholder="このKPIの説明を入力"
              />
            </div>
            <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={handleAddKpi} disabled={saving}>
                {saving ? '追加中...' : 'KPIを追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
