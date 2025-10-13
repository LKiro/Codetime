<template>
  <main :class="['app', theme]" style="max-width:1000px;margin:32px auto;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">
    <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h1 style="margin:0">Codetime 仪表盘</h1>
      <button @click="toggleTheme" title="切换暗色/亮色">{{ theme === 'dark' ? '切换为亮色' : '切换为暗色' }}</button>
    </header>
    <p>选择范围、时区与项目进行分析。</p>

    <section style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <a href="/auth/github" style="text-decoration:none;color:var(--link)">GitHub 登录</a>
      <label>Token: <input v-model="token" style="width:320px" /></label>
      <label>时区: <input v-model="tz" placeholder="Asia/Shanghai" style="width:180px" /></label>
      <label>项目: <input v-model="project" placeholder="留空为全部" style="width:180px" /></label>
      <select v-model="range">
        <option value="today">今天</option>
        <option value="yesterday">昨天</option>
        <option value="last3d">近 3 天</option>
        <option value="last7d">近 7 天</option>
      </select>
      <button @click="save">保存</button>
      <button @click="load">加载</button>
    </section>

    <section v-if="loading">加载中...</section>
    <section v-else>
      <h2>汇总</h2>
      <p>总分钟：<strong>{{ data.totalMinutes }}</strong></p>
      <h3>项目排行</h3>
      <ul>
        <li v-for="p in data.byProject" :key="p.project">{{ p.project }}：{{ p.minutes }} 分钟</li>
      </ul>
      <h3>趋势</h3>
      <Line :data="chartData" :options="chartOptions" />
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Line } from 'vue-chartjs';
import { Chart, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend } from 'chart.js';
Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

const token = ref(localStorage.getItem('codetime.token') || '');
const tz = ref(localStorage.getItem('codetime.tz') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
const project = ref('');
const range = ref('today');
const loading = ref(false);
const data = ref({ totalMinutes: 0, byProject: [], daily: [] });

const theme = ref(localStorage.getItem('codetime.theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
const accent = ref('#1976d2');
const accent20 = ref('rgba(25,118,210,0.2)');
const textColor = ref('#111111');
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function refreshColors() {
  const a = cssVar('--accent');
  const a20 = cssVar('--accent-20');
  const t = cssVar('--text');
  if (a) accent.value = a;
  if (a20) accent20.value = a20;
  if (t) textColor.value = t;
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value);
  localStorage.setItem('codetime.theme', theme.value);
  refreshColors();
}
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme();
}

function save() {
  localStorage.setItem('codetime.token', token.value || '');
  localStorage.setItem('codetime.tz', tz.value || '');
}

async function load() {
  if (!token.value) { alert('请先填写 token'); return; }
  loading.value = true;
  try {
    const params = new URLSearchParams({ range: range.value });
    if (project.value) params.set('project', project.value);
    if (tz.value) params.set('tz', tz.value);
    const res = await fetch(`/api/stats/summary?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token.value}` } });
    const j = await res.json();
    if (j && j.ok) data.value = j.data; else throw new Error(j.message || 'error');
  } catch (e) { alert('请求失败：' + (e.message || e)); } finally { loading.value = false; }
}

const chartData = computed(() => ({
  labels: data.value.daily.map(d => d.date),
  datasets: [{ label: '分钟', data: data.value.daily.map(d => d.minutes), borderColor: accent.value, backgroundColor: accent20.value, tension: 0.3 }]
}));
const chartOptions = computed(() => ({
  responsive: true,
  plugins: { legend: { position: 'top' }, title: { display: true, text: '日趋势', color: textColor.value } },
  scales: { x: { ticks: { color: textColor.value } }, y: { ticks: { color: textColor.value } } }
}));

onMounted(() => { applyTheme(); if (token.value) load(); });
</script>

<style>
:root{
  --bg: #ffffff;
  --fg: #f7f7f7;
  --text: #111111;
  --muted: #555555;
  --border: #dddddd;
  --link: #0969da;
  --accent: #1976d2;
  --accent-20: rgba(25,118,210,0.2);
}
[data-theme='dark']{
  --bg: #0f1115;
  --fg: #161a22;
  --text: #e6e6e6;
  --muted: #a0a0a0;
  --border: #2a2f3a;
  --link: #58a6ff;
  --accent: #58a6ff;
  --accent-20: rgba(88,166,255,0.2);
}

html, body { background: var(--bg); color: var(--text); }
.app h1, .app h2, .app h3 { color: var(--text); }
.app a { color: var(--link); }
.app section { background: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
.app input, .app select { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
.app button { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.app button:hover { background: var(--fg); }
</style>

<style scoped>
select,button,input{padding:6px;border:1px solid #ccc;border-radius:6px}
button{cursor:pointer}
button:hover{background:#f7f7f7}
</style>