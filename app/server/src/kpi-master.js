// 環境変数でDB切り替え
const usePostgres = !!process.env.DATABASE_URL;
let dbModule;
if (usePostgres) {
  dbModule = await import('./database-pg.js');
} else {
  dbModule = await import('./database.js');
}
const { get, run, all, saveDatabase } = dbModule;

// D2C KPIデータ定義
const DEFAULT_KPI_DATA = [
    // ========== KGI (Top Level) ==========
    { id: 'kgi_001', agent: 'COMMANDER', category: 'KGI', name: '年間売上', unit: '円', default_target: 1300000000, benchmark_min: 1000000000, benchmark_max: 1500000000, level: 1, parent_kpi_id: null, description: '年間売上目標13億円。売上 = 集客 × CVR × 顧客単価 × LTV' },

    // ========== Level 2: 4つの主要ドライバー ==========
    { id: 'drv_traffic', agent: 'ACQUISITION', category: '売上ドライバー', name: '集客（トラフィック）', unit: 'セッション', default_target: 2000000, benchmark_min: 1500000, benchmark_max: 3000000, level: 2, parent_kpi_id: 'kgi_001', description: '全チャネル合計のセッション数。売上の起点となる指標' },
    { id: 'drv_cvr', agent: 'OPERATIONS', category: '売上ドライバー', name: 'CVR（転換率）', unit: '%', default_target: 3.5, benchmark_min: 2.0, benchmark_max: 5.0, level: 2, parent_kpi_id: 'kgi_001', description: '訪問者が購入に至る割合。サイト改善で向上' },
    { id: 'drv_aov', agent: 'OPERATIONS', category: '売上ドライバー', name: '顧客単価（AOV）', unit: '円', default_target: 5000, benchmark_min: 3000, benchmark_max: 8000, level: 2, parent_kpi_id: 'kgi_001', description: '1回あたりの平均注文金額。クロスセル・アップセルで向上' },
    { id: 'drv_ltv', agent: 'ENGAGEMENT', category: '売上ドライバー', name: 'LTV（顧客生涯価値）', unit: '円', default_target: 15000, benchmark_min: 10000, benchmark_max: 25000, level: 2, parent_kpi_id: 'kgi_001', description: '1顧客から得られる累計売上。リピート施策で向上' },
    { id: 'drv_profit', agent: 'COMMANDER', category: '利益', name: '粗利益', unit: '円', default_target: 845000000, benchmark_min: 650000000, benchmark_max: 950000000, level: 2, parent_kpi_id: 'kgi_001', description: '売上 - 売上原価。D2C目標粗利率: 60-70%' },

    // ========== Level 3: 集客の内訳 ==========
    { id: 'trf_amazon', agent: 'ACQUISITION', category: 'チャネル別集客', name: 'Amazon集客', unit: 'セッション', default_target: 800000, benchmark_min: 500000, benchmark_max: 1200000, level: 3, parent_kpi_id: 'drv_traffic', description: 'Amazon商品ページへのセッション数' },
    { id: 'trf_rakuten', agent: 'ACQUISITION', category: 'チャネル別集客', name: '楽天集客', unit: 'セッション', default_target: 550000, benchmark_min: 350000, benchmark_max: 800000, level: 3, parent_kpi_id: 'drv_traffic', description: '楽天ショップへのセッション数' },
    { id: 'trf_own', agent: 'ACQUISITION', category: 'チャネル別集客', name: '自社EC集客', unit: 'セッション', default_target: 600000, benchmark_min: 400000, benchmark_max: 900000, level: 3, parent_kpi_id: 'drv_traffic', description: '自社ECサイトへのセッション数' },
    { id: 'trf_b2b', agent: 'ACQUISITION', category: 'チャネル別集客', name: 'B2B集客', unit: '件', default_target: 50000, benchmark_min: 30000, benchmark_max: 100000, level: 3, parent_kpi_id: 'drv_traffic', description: 'B2B向けリード・問い合わせ数' },
    { id: 'ads_total', agent: 'ACQUISITION', category: '広告投資', name: '総広告費', unit: '円', default_target: 144000000, benchmark_min: 100000000, benchmark_max: 200000000, level: 3, parent_kpi_id: 'drv_traffic', description: '全チャネル合計の広告投資額' },

    // ========== Level 3: CVRの内訳 ==========
    { id: 'cvr_amazon', agent: 'OPERATIONS', category: 'チャネル別CVR', name: 'Amazon CVR', unit: '%', default_target: 4.0, benchmark_min: 2.5, benchmark_max: 6.0, level: 3, parent_kpi_id: 'drv_cvr', description: 'Amazon購入転換率。目安: 3-5%' },
    { id: 'cvr_rakuten', agent: 'OPERATIONS', category: 'チャネル別CVR', name: '楽天CVR', unit: '%', default_target: 4.0, benchmark_min: 2.5, benchmark_max: 6.0, level: 3, parent_kpi_id: 'drv_cvr', description: '楽天購入転換率。目安: 3-5%' },
    { id: 'cvr_own', agent: 'OPERATIONS', category: 'チャネル別CVR', name: '自社EC CVR', unit: '%', default_target: 3.0, benchmark_min: 1.5, benchmark_max: 5.0, level: 3, parent_kpi_id: 'drv_cvr', description: '自社EC購入転換率。目安: 2-4%' },
    { id: 'cvr_cart', agent: 'OPERATIONS', category: 'CVR改善', name: 'カート離脱率', unit: '%', default_target: 70, benchmark_min: 60, benchmark_max: 80, level: 3, parent_kpi_id: 'drv_cvr', description: 'カート離脱率。低いほど良い。目安: 65-75%' },

    // ========== Level 3: 顧客単価の内訳 ==========
    { id: 'aov_base', agent: 'OPERATIONS', category: '価格戦略', name: '平均商品単価', unit: '円', default_target: 5500, benchmark_min: 4000, benchmark_max: 7000, level: 3, parent_kpi_id: 'drv_aov', description: '割引前の平均販売価格' },
    { id: 'aov_cross', agent: 'OPERATIONS', category: '価格戦略', name: 'クロスセル率', unit: '%', default_target: 15, benchmark_min: 8, benchmark_max: 25, level: 3, parent_kpi_id: 'drv_aov', description: '複数商品購入注文の割合' },
    { id: 'aov_discount', agent: 'OPERATIONS', category: '価格戦略', name: '割引率', unit: '%', default_target: 10, benchmark_min: 5, benchmark_max: 20, level: 3, parent_kpi_id: 'drv_aov', description: '平均割引率。15%以下に抑えて利益確保' },
    { id: 'aov_upsell', agent: 'OPERATIONS', category: '価格戦略', name: 'アップセル率', unit: '%', default_target: 10, benchmark_min: 5, benchmark_max: 20, level: 3, parent_kpi_id: 'drv_aov', description: '上位商品への購入転換率' },

    // ========== Level 3: LTVの内訳 ==========
    { id: 'ltv_repeat', agent: 'ENGAGEMENT', category: 'リピート', name: 'リピート率', unit: '%', default_target: 40, benchmark_min: 25, benchmark_max: 55, level: 3, parent_kpi_id: 'drv_ltv', description: '再購入顧客の割合。D2C目標: 35-50%' },
    { id: 'ltv_f2', agent: 'ENGAGEMENT', category: 'リピート', name: 'F2転換率', unit: '%', default_target: 30, benchmark_min: 20, benchmark_max: 45, level: 3, parent_kpi_id: 'drv_ltv', description: '初回→2回目購入の転換率。CRM施策の重要指標' },
    { id: 'ltv_freq', agent: 'ENGAGEMENT', category: 'リピート', name: '購入頻度', unit: '回/年', default_target: 2.5, benchmark_min: 1.5, benchmark_max: 4.0, level: 3, parent_kpi_id: 'drv_ltv', description: '1顧客あたりの年間購入回数' },
    { id: 'ltv_interval', agent: 'ENGAGEMENT', category: 'リピート', name: '購入間隔', unit: '日', default_target: 60, benchmark_min: 30, benchmark_max: 90, level: 3, parent_kpi_id: 'drv_ltv', description: '平均購入間隔日数。短いほど良い' },
    { id: 'ltv_cac', agent: 'ACQUISITION', category: 'ユニットエコノミクス', name: 'LTV/CAC比率', unit: '倍', default_target: 3.0, benchmark_min: 2.0, benchmark_max: 5.0, level: 3, parent_kpi_id: 'drv_ltv', description: '顧客価値と獲得コストの比率。目標: 3.0倍以上' },

    // ========== Level 3: 利益の内訳 ==========
    { id: 'prf_margin', agent: 'COMMANDER', category: '利益', name: '粗利率', unit: '%', default_target: 65, benchmark_min: 55, benchmark_max: 72, level: 3, parent_kpi_id: 'drv_profit', description: '粗利益 ÷ 売上。D2C目標: 60-70%' },
    { id: 'prf_op', agent: 'COMMANDER', category: '利益', name: '営業利益', unit: '円', default_target: 195000000, benchmark_min: 130000000, benchmark_max: 260000000, level: 3, parent_kpi_id: 'drv_profit', description: '粗利益 - 販管費。事業の収益性を示す' },

    // ========== Level 4: Amazon集客の内訳 ==========
    { id: 'amz_ads', agent: 'ACQUISITION', category: 'Amazon広告', name: 'Amazon広告クリック', unit: 'クリック', default_target: 400000, benchmark_min: 250000, benchmark_max: 600000, level: 4, parent_kpi_id: 'trf_amazon', description: 'Amazonスポンサー広告からのクリック数' },
    { id: 'amz_organic', agent: 'ACQUISITION', category: 'Amazon集客', name: 'Amazonオーガニック', unit: 'セッション', default_target: 400000, benchmark_min: 250000, benchmark_max: 600000, level: 4, parent_kpi_id: 'trf_amazon', description: 'Amazon検索からの自然流入' },
    { id: 'amz_spend', agent: 'ACQUISITION', category: 'Amazon広告', name: 'Amazon広告費', unit: '円', default_target: 55000000, benchmark_min: 40000000, benchmark_max: 75000000, level: 4, parent_kpi_id: 'trf_amazon', description: 'Amazonスポンサー広告への投資額' },
    { id: 'amz_acos', agent: 'ACQUISITION', category: 'Amazon広告', name: 'ACoS', unit: '%', default_target: 20, benchmark_min: 12, benchmark_max: 30, level: 4, parent_kpi_id: 'trf_amazon', description: '広告売上比率。目標: 25%未満' },

    // ========== Level 4: 楽天集客の内訳 ==========
    { id: 'rkt_rpp', agent: 'ACQUISITION', category: '楽天広告', name: 'RPPクリック', unit: 'クリック', default_target: 200000, benchmark_min: 120000, benchmark_max: 300000, level: 4, parent_kpi_id: 'trf_rakuten', description: '楽天RPP広告からのクリック数' },
    { id: 'rkt_organic', agent: 'ACQUISITION', category: '楽天集客', name: '楽天オーガニック', unit: 'セッション', default_target: 350000, benchmark_min: 220000, benchmark_max: 500000, level: 4, parent_kpi_id: 'trf_rakuten', description: '楽天検索からの自然流入' },
    { id: 'rkt_spend', agent: 'ACQUISITION', category: '楽天広告', name: '楽天広告費', unit: '円', default_target: 35000000, benchmark_min: 25000000, benchmark_max: 50000000, level: 4, parent_kpi_id: 'trf_rakuten', description: '楽天RPP/CPCへの投資額' },
    { id: 'rkt_roas', agent: 'ACQUISITION', category: '楽天広告', name: '楽天ROAS', unit: '%', default_target: 500, benchmark_min: 350, benchmark_max: 700, level: 4, parent_kpi_id: 'trf_rakuten', description: '楽天広告の投資対効果' },

    // ========== Level 4: 自社EC集客の内訳 ==========
    { id: 'own_paid', agent: 'ACQUISITION', category: '自社EC広告', name: 'Google/Meta広告', unit: 'クリック', default_target: 300000, benchmark_min: 180000, benchmark_max: 450000, level: 4, parent_kpi_id: 'trf_own', description: 'Google/Meta広告からの有料トラフィック' },
    { id: 'own_seo', agent: 'ACQUISITION', category: '自社EC集客', name: 'SEOオーガニック', unit: 'セッション', default_target: 200000, benchmark_min: 120000, benchmark_max: 300000, level: 4, parent_kpi_id: 'trf_own', description: 'Google/Yahooからの自然検索流入' },
    { id: 'own_sns', agent: 'CREATIVE', category: '自社EC集客', name: 'SNS/インフルエンサー', unit: 'セッション', default_target: 100000, benchmark_min: 50000, benchmark_max: 180000, level: 4, parent_kpi_id: 'trf_own', description: 'SNSとインフルエンサーからの流入' },
    { id: 'own_affiliate', agent: 'ACQUISITION', category: 'アフィリエイト', name: 'アフィリエイト流入', unit: 'セッション', default_target: 50000, benchmark_min: 30000, benchmark_max: 100000, level: 4, parent_kpi_id: 'trf_own', description: 'アフィリエイト経由の流入' },

    // ========== Level 4: 広告費の内訳 ==========
    { id: 'ads_google', agent: 'ACQUISITION', category: 'Google広告', name: 'Google広告費', unit: '円', default_target: 30000000, benchmark_min: 20000000, benchmark_max: 45000000, level: 4, parent_kpi_id: 'ads_total', description: 'Google検索/ショッピング/ディスプレイへの投資額' },
    { id: 'ads_meta', agent: 'ACQUISITION', category: 'Meta広告', name: 'Meta広告費', unit: '円', default_target: 24000000, benchmark_min: 15000000, benchmark_max: 35000000, level: 4, parent_kpi_id: 'ads_total', description: 'Facebook/Instagram広告への投資額' },
    { id: 'ads_cpa', agent: 'ACQUISITION', category: '広告効率', name: 'CPA', unit: '円', default_target: 1846, benchmark_min: 1000, benchmark_max: 3000, level: 4, parent_kpi_id: 'ads_total', description: '広告費 ÷ コンバージョン数' },
    { id: 'ads_roas', agent: 'ACQUISITION', category: '広告効率', name: 'ROAS', unit: '%', default_target: 450, benchmark_min: 300, benchmark_max: 600, level: 4, parent_kpi_id: 'ads_total', description: '広告投資対効果。目標: 400%以上' },

    // ========== Level 4: リピート施策の内訳 ==========
    { id: 'crm_email', agent: 'ENGAGEMENT', category: 'CRM', name: 'メール会員数', unit: '人', default_target: 80000, benchmark_min: 50000, benchmark_max: 120000, level: 4, parent_kpi_id: 'ltv_repeat', description: 'アクティブなメール購読者数' },
    { id: 'crm_line', agent: 'ENGAGEMENT', category: 'CRM', name: 'LINE友だち数', unit: '人', default_target: 50000, benchmark_min: 30000, benchmark_max: 80000, level: 4, parent_kpi_id: 'ltv_repeat', description: 'LINE公式アカウントの友だち数' },
    { id: 'crm_app', agent: 'ENGAGEMENT', category: 'CRM', name: 'アプリユーザー数', unit: '人', default_target: 20000, benchmark_min: 10000, benchmark_max: 40000, level: 4, parent_kpi_id: 'ltv_repeat', description: 'アクティブなアプリユーザー数' },
    { id: 'ltv_f3', agent: 'ENGAGEMENT', category: 'リピート', name: 'F3+転換率', unit: '%', default_target: 50, benchmark_min: 35, benchmark_max: 65, level: 4, parent_kpi_id: 'ltv_repeat', description: 'F2→F3以上の転換率。ロイヤル顧客の指標' },

    // ========== Level 4: 営業利益の内訳 ==========
    { id: 'prf_op_margin', agent: 'COMMANDER', category: '利益', name: '営業利益率', unit: '%', default_target: 15, benchmark_min: 10, benchmark_max: 20, level: 4, parent_kpi_id: 'prf_op', description: '営業利益 ÷ 売上。目標: 15%以上' },

    // ========== Level 5: Google/Meta広告の詳細 ==========
    { id: 'google_roas', agent: 'ACQUISITION', category: 'Google広告', name: 'Google ROAS', unit: '%', default_target: 400, benchmark_min: 280, benchmark_max: 550, level: 5, parent_kpi_id: 'ads_google', description: 'Google広告の投資対効果' },
    { id: 'meta_roas', agent: 'ACQUISITION', category: 'Meta広告', name: 'Meta ROAS', unit: '%', default_target: 350, benchmark_min: 250, benchmark_max: 500, level: 5, parent_kpi_id: 'ads_meta', description: 'Meta広告の投資対効果' },

    // ========== Level 5: メール施策の詳細 ==========
    { id: 'email_open', agent: 'ENGAGEMENT', category: 'メール', name: 'メール開封率', unit: '%', default_target: 25, benchmark_min: 15, benchmark_max: 40, level: 5, parent_kpi_id: 'crm_email', description: 'メール開封率。目安: 20-30%' },
    { id: 'email_ctr', agent: 'ENGAGEMENT', category: 'メール', name: 'メールCTR', unit: '%', default_target: 3, benchmark_min: 1.5, benchmark_max: 6, level: 5, parent_kpi_id: 'crm_email', description: 'メールクリック率。目安: 2-5%' },
    { id: 'email_cvr', agent: 'ENGAGEMENT', category: 'メール', name: 'メールCVR', unit: '%', default_target: 2, benchmark_min: 1, benchmark_max: 4, level: 5, parent_kpi_id: 'crm_email', description: 'メール経由の購入転換率' },
    { id: 'email_rev', agent: 'ENGAGEMENT', category: 'メール', name: 'メール経由売上', unit: '円', default_target: 80000000, benchmark_min: 50000000, benchmark_max: 120000000, level: 5, parent_kpi_id: 'crm_email', description: 'メールマーケティング経由の売上' },

    // ========== Level 5: LINE施策の詳細 ==========
    { id: 'line_open', agent: 'ENGAGEMENT', category: 'LINE', name: 'LINE開封率', unit: '%', default_target: 60, benchmark_min: 40, benchmark_max: 80, level: 5, parent_kpi_id: 'crm_line', description: 'LINEメッセージ開封率。目安: 50-70%' },
    { id: 'line_ctr', agent: 'ENGAGEMENT', category: 'LINE', name: 'LINE CTR', unit: '%', default_target: 8, benchmark_min: 4, benchmark_max: 15, level: 5, parent_kpi_id: 'crm_line', description: 'LINEクリック率。目安: 5-10%' },
    { id: 'line_cvr', agent: 'ENGAGEMENT', category: 'LINE', name: 'LINE CVR', unit: '%', default_target: 3, benchmark_min: 1.5, benchmark_max: 6, level: 5, parent_kpi_id: 'crm_line', description: 'LINE経由の購入転換率' },
    { id: 'line_rev', agent: 'ENGAGEMENT', category: 'LINE', name: 'LINE経由売上', unit: '円', default_target: 60000000, benchmark_min: 30000000, benchmark_max: 100000000, level: 5, parent_kpi_id: 'crm_line', description: 'LINEマーケティング経由の売上' },

    // ========== Level 5: SNS/コンテンツの詳細 ==========
    { id: 'sns_ig', agent: 'CREATIVE', category: 'SNS', name: 'Instagramフォロワー', unit: '人', default_target: 50000, benchmark_min: 20000, benchmark_max: 100000, level: 5, parent_kpi_id: 'own_sns', description: 'Instagramアカウントのフォロワー数' },
    { id: 'sns_engagement', agent: 'CREATIVE', category: 'SNS', name: 'エンゲージメント率', unit: '%', default_target: 3, benchmark_min: 2, benchmark_max: 6, level: 5, parent_kpi_id: 'own_sns', description: 'SNSエンゲージメント率。目安: 2-4%' },
    { id: 'sns_ugc', agent: 'CREATIVE', category: 'UGC', name: 'UGC投稿数', unit: '投稿', default_target: 1000, benchmark_min: 500, benchmark_max: 2000, level: 5, parent_kpi_id: 'own_sns', description: 'ユーザー生成コンテンツの投稿数' },

    // ========== Level 5: コンテンツ/クリエイティブ ==========
    { id: 'crt_pages', agent: 'CREATIVE', category: 'コンテンツ', name: '商品ページ数', unit: 'ページ', default_target: 100, benchmark_min: 50, benchmark_max: 200, level: 5, parent_kpi_id: 'own_seo', description: '最適化された商品詳細ページ数' },
    { id: 'crt_blog', agent: 'CREATIVE', category: 'コンテンツ', name: 'ブログ記事数', unit: '記事', default_target: 200, benchmark_min: 100, benchmark_max: 400, level: 5, parent_kpi_id: 'own_seo', description: 'SEO向けブログ記事数' },

    // ========== Level 5: 運用指標 ==========
    { id: 'ops_stock', agent: 'OPERATIONS', category: '在庫', name: '在庫日数', unit: '日', default_target: 45, benchmark_min: 30, benchmark_max: 60, level: 5, parent_kpi_id: 'aov_base', description: '在庫回転日数。目標: 30-60日' },
    { id: 'ops_stockout', agent: 'OPERATIONS', category: '在庫', name: '欠品率', unit: '%', default_target: 2, benchmark_min: 0, benchmark_max: 5, level: 5, parent_kpi_id: 'aov_base', description: '商品欠品率。目標: 3%未満' },
    { id: 'ops_delivery', agent: 'OPERATIONS', category: 'フルフィルメント', name: '配送日数', unit: '日', default_target: 2, benchmark_min: 1, benchmark_max: 3, level: 5, parent_kpi_id: 'cvr_own', description: '平均配送リードタイム。目標: 1-2日' },
    { id: 'ops_return', agent: 'OPERATIONS', category: 'フルフィルメント', name: '返品率', unit: '%', default_target: 3, benchmark_min: 1, benchmark_max: 5, level: 5, parent_kpi_id: 'cvr_own', description: '商品返品率。目標: 5%未満' },

    // ========== Level 5: 顧客分析 ==========
    { id: 'ins_nps', agent: 'INSIGHT', category: '分析', name: 'NPS', unit: 'ポイント', default_target: 40, benchmark_min: 20, benchmark_max: 60, level: 5, parent_kpi_id: 'ltv_repeat', description: '顧客推奨度スコア。-100〜+100。良好: 30+' },
    { id: 'ins_review', agent: 'INSIGHT', category: '分析', name: 'レビュー評価', unit: '星', default_target: 4.5, benchmark_min: 4.0, benchmark_max: 5.0, level: 5, parent_kpi_id: 'ltv_repeat', description: '平均レビュー評価（5段階）' },
    { id: 'ins_30d', agent: 'INSIGHT', category: 'コホート', name: '30日リテンション', unit: '%', default_target: 45, benchmark_min: 30, benchmark_max: 60, level: 5, parent_kpi_id: 'ltv_freq', description: '30日以内に再購入した顧客の割合' },
    { id: 'ins_90d', agent: 'INSIGHT', category: 'コホート', name: '90日リテンション', unit: '%', default_target: 25, benchmark_min: 15, benchmark_max: 40, level: 5, parent_kpi_id: 'ltv_freq', description: '90日以内に再購入した顧客の割合' },

    // ========== 広告クリエイティブ ==========
    { id: 'crt_ads', agent: 'CREATIVE', category: '広告クリエイティブ', name: '広告クリエイティブ数', unit: '本', default_target: 100, benchmark_min: 50, benchmark_max: 200, level: 5, parent_kpi_id: 'own_paid', description: 'アクティブな広告クリエイティブ数' },
    { id: 'crt_ctr', agent: 'CREATIVE', category: '広告クリエイティブ', name: '広告CTR', unit: '%', default_target: 1.5, benchmark_min: 0.8, benchmark_max: 3.0, level: 5, parent_kpi_id: 'own_paid', description: '広告クリック率' },
];

// デフォルトKPIテンプレートを初期化
export async function initializeDefaultTemplate() {
  const existingTemplate = await get('SELECT id FROM kpi_templates WHERE is_default = 1');
  if (existingTemplate) return existingTemplate.id;

  const templateId = 'default_d2c_template';

  await run(
    `INSERT INTO kpi_templates (id, name, description, is_default) VALUES (?, ?, ?, 1)`,
    [templateId, 'D2C標準KPIテンプレート', '売上 = 集客 × CVR × 顧客単価 × LTV の構造に基づくD2Cビジネス向け標準KPIセット']
  );

  for (const kpi of DEFAULT_KPI_DATA) {
    const itemId = `${templateId}_${kpi.id}`;
    await run(
      `INSERT INTO kpi_template_items (id, template_id, agent, category, name, unit, default_target, benchmark_min, benchmark_max, parent_kpi_id, level, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, templateId, kpi.agent, kpi.category, kpi.name, kpi.unit, kpi.default_target, kpi.benchmark_min, kpi.benchmark_max, kpi.parent_kpi_id, kpi.level, kpi.description]
    );
  }

  saveDatabase();
  console.log(`[OK] Default KPI template initialized (${DEFAULT_KPI_DATA.length} items)`);
  return templateId;
}

// KPIマスター初期化（後方互換用 - tenant_idなしで初期化）
export async function initializeKpiMaster() {
  const count = await get('SELECT COUNT(*) as count FROM kpi_master WHERE tenant_id IS NULL');
  if (count && count.count > 0) return;

  for (const kpi of DEFAULT_KPI_DATA) {
    await run(
      `INSERT INTO kpi_master (id, tenant_id, agent, category, name, unit, default_target, benchmark_min, benchmark_max, level, parent_kpi_id, description)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [kpi.id, kpi.agent, kpi.category, kpi.name, kpi.unit, kpi.default_target, kpi.benchmark_min, kpi.benchmark_max, kpi.level, kpi.parent_kpi_id, kpi.description]
    );
  }

  saveDatabase();
  console.log(`[OK] KPI Master data initialized (${DEFAULT_KPI_DATA.length} items)`);
}

// テナント用にKPIを初期化
export async function initializeKpiForTenant(tenantId, templateId = null) {
  const count = await get('SELECT COUNT(*) as count FROM kpi_master WHERE tenant_id = ?', [tenantId]);
  if (count && count.count > 0) return;

  let sourceData;
  let sourceTemplateId = templateId;

  if (templateId) {
    sourceData = await all('SELECT * FROM kpi_template_items WHERE template_id = ?', [templateId]);
  } else {
    const defaultTemplate = await get('SELECT id FROM kpi_templates WHERE is_default = 1');
    if (defaultTemplate) {
      sourceTemplateId = defaultTemplate.id;
      sourceData = await all('SELECT * FROM kpi_template_items WHERE template_id = ?', [defaultTemplate.id]);
    } else {
      sourceTemplateId = null;
      sourceData = DEFAULT_KPI_DATA;
    }
  }

  for (const kpi of sourceData) {
    // テンプレートIDプレフィックスを除去してオリジナルIDを抽出
    let baseId;
    if (sourceTemplateId && kpi.id.startsWith(sourceTemplateId + '_')) {
      baseId = kpi.id.substring(sourceTemplateId.length + 1);
    } else {
      baseId = kpi.id;
    }

    const newId = `${tenantId}_${baseId}`;

    // 親KPIのIDも同様に変換
    let parentId = null;
    if (kpi.parent_kpi_id) {
      let baseParentId;
      if (sourceTemplateId && kpi.parent_kpi_id.startsWith(sourceTemplateId + '_')) {
        baseParentId = kpi.parent_kpi_id.substring(sourceTemplateId.length + 1);
      } else {
        baseParentId = kpi.parent_kpi_id;
      }
      parentId = `${tenantId}_${baseParentId}`;
    }

    await run(
      `INSERT INTO kpi_master (id, tenant_id, agent, category, name, unit, default_target, benchmark_min, benchmark_max, level, parent_kpi_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, tenantId, kpi.agent, kpi.category, kpi.name, kpi.unit, kpi.default_target, kpi.benchmark_min, kpi.benchmark_max, kpi.level, parentId, kpi.description]
    );
  }

  saveDatabase();
  console.log(`[OK] KPI Master data initialized for tenant ${tenantId} (${sourceData.length} items)`);
}

// KPI追加機能（テナント対応）
export async function addKpi(kpiData, tenantId = null) {
  const { id, agent, category, name, unit, default_target, benchmark_min, benchmark_max, level, parent_kpi_id, description } = kpiData;

  // テナント用IDを生成
  const kpiId = tenantId ? `${tenantId}_${id}` : id;
  const parentKpiId = parent_kpi_id && tenantId ? `${tenantId}_${parent_kpi_id}` : parent_kpi_id;

  // 既存チェック
  const existing = await get('SELECT id FROM kpi_master WHERE id = ?', [kpiId]);
  if (existing) {
    throw new Error('KPI ID already exists');
  }

  await run(
    `INSERT INTO kpi_master (id, tenant_id, agent, category, name, unit, default_target, benchmark_min, benchmark_max, level, parent_kpi_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [kpiId, tenantId, agent, category, name, unit, default_target, benchmark_min, benchmark_max, level, parentKpiId, description]
  );

  saveDatabase();
  return await get('SELECT * FROM kpi_master WHERE id = ?', [kpiId]);
}

// KPI更新機能
export async function updateKpi(id, kpiData) {
  const { agent, category, name, unit, default_target, benchmark_min, benchmark_max, level, parent_kpi_id, description } = kpiData;

  await run(
    `UPDATE kpi_master SET agent = ?, category = ?, name = ?, unit = ?, default_target = ?, benchmark_min = ?, benchmark_max = ?, level = ?, parent_kpi_id = ?, description = ?
     WHERE id = ?`,
    [agent, category, name, unit, default_target, benchmark_min, benchmark_max, level, parent_kpi_id, description, id]
  );

  saveDatabase();
  return await get('SELECT * FROM kpi_master WHERE id = ?', [id]);
}

// KPI削除機能
export async function deleteKpi(id) {
  // 子KPIがある場合は削除不可
  const children = await all('SELECT id FROM kpi_master WHERE parent_kpi_id = ?', [id]);
  if (children.length > 0) {
    throw new Error('Cannot delete KPI with children');
  }

  await run('DELETE FROM kpi_master WHERE id = ?', [id]);
  saveDatabase();
}

// テナント別KPI一覧取得
export async function getKpisByTenant(tenantId) {
  if (tenantId) {
    return await all('SELECT * FROM kpi_master WHERE tenant_id = ? ORDER BY level, agent, category, id', [tenantId]);
  }
  // テナントなしの場合は従来のグローバルKPI
  return await all('SELECT * FROM kpi_master WHERE tenant_id IS NULL ORDER BY level, agent, category, id');
}
