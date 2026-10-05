/* eslint-disable no-alert */

const api = {
  async getNodeTypes() {
    const r = await fetch('/api/node_types');
    if (!r.ok) throw new Error('No se pudieron cargar los tipos de nodo');
    return r.json();
  },
  async listProjects() {
    const r = await fetch('/api/projects');
    if (!r.ok) throw new Error('No se pudieron cargar los proyectos');
    return r.json();
  },
  async createProject() {
    const r = await fetch('/api/projects', { method: 'POST' });
    if (!r.ok) throw new Error('No se pudo crear el proyecto');
    return r.json();
  },
  async importProject(projectJson) {
    const r = await fetch('/api/projects/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectJson),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo importar');
    }
    return r.json();
  },
  async getProject(id) {
    const r = await fetch(`/api/projects/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('No se pudo cargar el proyecto');
    return r.json();
  },
  async saveProject(project) {
    const r = await fetch(`/api/projects/${encodeURIComponent(project.id)}` , {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo guardar');
    }
    return r.json();
  },
  async duplicateProject(id) {
    const r = await fetch(`/api/projects/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
    if (!r.ok) throw new Error('No se pudo duplicar el proyecto');
    return r.json();
  },
  async deleteProject(id) {
    const r = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('No se pudo eliminar');
  },
  async executeProject(id) {
    const r = await fetch(`/api/projects/${encodeURIComponent(id)}/execute`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'Error al ejecutar'), { data });
    return data;
  },
  async executeNode(id, nodeId) {
    const r = await fetch(`/api/projects/${encodeURIComponent(id)}/execute_node`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'Error al ejecutar nodo'), { data });
    return data;
  },
  debugStart: (id) => debugRequest(id, 'start', { method: 'POST' }),
  debugStep: (id) => debugRequest(id, 'step', { method: 'POST' }),
  debugRepeat: (id) => debugRequest(id, 'repeat', { method: 'POST' }),
  debugStop: (id) => debugRequest(id, 'stop', { method: 'POST' }),
  debugNode: (id, nodeId) => debugRequest(id, `node?nodeId=${encodeURIComponent(nodeId)}`),
  async streamExecuteProject(id, onEvent) {
    return streamExecutionRequest(`/api/projects/${encodeURIComponent(id)}/execute/stream`, {
      method: 'POST',
    }, onEvent);
  },
  async streamExecuteNode(id, nodeId, onEvent) {
    return streamExecutionRequest(`/api/projects/${encodeURIComponent(id)}/execute_node/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId }),
    }, onEvent);
  },
};

async function debugRequest(id, path, options) {
  const r = await fetch(`/api/projects/${encodeURIComponent(id)}/debug/${path}`, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Error de depuración'), { data });
  return data;
}

async function streamExecutionRequest(url, options, onEvent) {
  const r = await fetch(url, options);
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || 'Error de ejecución'), { data });
  }
  if (!r.body) throw new Error('El navegador no soporta streaming de ejecución');

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneResult = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const payload = JSON.parse(line);
        onEvent(payload);
        if (payload.type === 'done') doneResult = payload.result;
        if (payload.type === 'error') {
          throw Object.assign(new Error(payload.error || 'Error de ejecución'), { data: payload });
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }

    if (done) break;
  }

  const rest = buffer.trim();
  if (rest) {
    const payload = JSON.parse(rest);
    onEvent(payload);
    if (payload.type === 'done') doneResult = payload.result;
    if (payload.type === 'error') {
      throw Object.assign(new Error(payload.error || 'Error de ejecución'), { data: payload });
    }
  }

  if (!doneResult) throw new Error('La ejecución terminó sin resultado');
  return doneResult;
}

const ROUTE_COLORS = {
  boolean: 'var(--wire-boolean)',
  list: 'var(--wire-list)',
  int: 'var(--wire-int)',
  float: 'var(--wire-float)',
  string: 'var(--wire-string)',
  exec: 'var(--wire-exec)',
  bytes: 'var(--wire-bytes)',
  image: 'var(--wire-image)',
  vector2: 'var(--wire-vector2)',
  dict: 'var(--wire-dict)',
  any: 'var(--wire-exec)',
};

const NODE_COLOR_OPTIONS = [
  { value: '', label: 'Por defecto', hex: '' },
  { value: 'green', label: 'Verde', hex: '#22c55e' },
  { value: 'red', label: 'Rojo', hex: '#ef4444' },
  { value: 'yellow', label: 'Amarillo', hex: '#eab308' },
  { value: 'orange', label: 'Naranja', hex: '#f97316' },
  { value: 'blue', label: 'Azul', hex: '#3b82f6' },
  { value: 'white', label: 'Blanco', hex: '#e5e7eb' },
];

const NODE_COLOR_MAP = Object.fromEntries(NODE_COLOR_OPTIONS.map((x) => [x.value, x.hex]));

const state = {
  nodeTypes: [],
  nodeTypesByType: {},
  projects: [],
  currentProject: null,
  selectedNodeId: null,
  selectedNodeIds: [],
  clipboardNode: null,
  connecting: null,
  mouse: { x: 120, y: 120 },
  viewport: { x: 0, y: 0 },
  zoom: 1,
  paletteContext: null,
  debug: {
    active: false,
    busy: false,
    finished: false,
    canRepeat: false,
    nextNodeId: null,
    executedNodeIds: [],
    nodeValues: {},
    pending: new Set(),
    version: 0,
  },
  localErrorsByNode: new Map(),
  execution: {
    running: false,
    label: '',
    activeNodeIds: [],
    completedSteps: 0,
    totalSteps: 0,
    elapsedMs: 0,
    timerId: null,
    startedAt: 0,
  },
};

const el = {
  tabs: document.getElementById('tabs'),
  addProjectBtn: document.getElementById('addProjectBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeLabel: document.getElementById('themeLabel'),
  runProjectBtn: document.getElementById('runProjectBtn'),
  debugProjectBtn: document.getElementById('debugProjectBtn'),
  debugControls: document.getElementById('debugControls'),
  debugRepeatBtn: document.getElementById('debugRepeatBtn'),
  debugStepBtn: document.getElementById('debugStepBtn'),
  debugStopBtn: document.getElementById('debugStopBtn'),
  debugStatus: document.getElementById('debugStatus'),
  executionStatus: document.getElementById('executionStatus'),
  executionProgressBar: document.getElementById('executionProgressBar'),
  executionLabel: document.getElementById('executionLabel'),
  executionCounter: document.getElementById('executionCounter'),
  projectHint: document.getElementById('projectHint'),
  editor: document.getElementById('editor'),
  nodes: document.getElementById('nodes'),
  wires: document.getElementById('wires'),
  inspectorBody: document.getElementById('inspectorBody'),
  console: document.getElementById('console'),
  toastStack: document.getElementById('toastStack'),
  palette: document.getElementById('palette'),
  paletteSearch: document.getElementById('paletteSearch'),
  paletteList: document.getElementById('paletteList'),
};

function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function toast(title, msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${kind === 'error' ? 'error' : kind === 'success' ? 'success' : ''}`;
  t.innerHTML = `<div class="toast-title"></div><div class="toast-msg"></div>`;
  t.querySelector('.toast-title').textContent = title;
  t.querySelector('.toast-msg').textContent = msg;
  el.toastStack.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function clearConsole() {
  el.console.textContent = '';
}

function appendConsole(lines) {
  const existing = el.console.textContent ? el.console.textContent + '\n' : '';
  el.console.textContent = existing + lines.join('\n');
  el.console.scrollTop = el.console.scrollHeight;
}

function formatDuration(ms) {
  const seconds = Math.max(0, ms) / 1000;
  return `${seconds.toFixed(1)} s`;
}

function hexToRgba(hex, alpha) {
  if (!hex) return 'var(--panel)';
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return 'var(--panel)';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderExecutionStatus() {
  const exec = state.execution;
  const visible = exec.running || exec.elapsedMs > 0 || exec.completedSteps > 0;
  el.executionStatus.hidden = !visible;
  if (!visible) return;

  const total = Math.max(exec.totalSteps || 0, exec.completedSteps || 0, 1);
  const progress = exec.running ? Math.max(0, Math.min(100, (exec.completedSteps / total) * 100)) : 100;
  el.executionProgressBar.style.width = `${progress}%`;
  el.executionLabel.textContent = exec.label || 'Ejecutando';
  el.executionCounter.textContent = `${exec.completedSteps}/${total} · ${formatDuration(exec.elapsedMs)}`;
}

function syncExecutingNodeClasses() {
  const active = new Set(state.execution.activeNodeIds);
  el.nodes.querySelectorAll('.node').forEach((nodeEl) => {
    nodeEl.classList.toggle('executing', active.has(nodeEl.dataset.nodeId));
  });
}

function startExecutionTracking(label) {
  stopExecutionTimer();
  state.execution.running = true;
  state.execution.label = label;
  state.execution.activeNodeIds = [];
  state.execution.completedSteps = 0;
  state.execution.totalSteps = 0;
  state.execution.elapsedMs = 0;
  state.execution.startedAt = performance.now();
  state.execution.timerId = window.setInterval(() => {
    state.execution.elapsedMs = Math.round(performance.now() - state.execution.startedAt);
    renderExecutionStatus();
  }, 80);
  renderExecutionStatus();
  renderProject();
}

function stopExecutionTimer() {
  if (state.execution.timerId) {
    window.clearInterval(state.execution.timerId);
    state.execution.timerId = null;
  }
}

function updateExecutionStep(step) {
  state.execution.completedSteps = step.completedSteps || state.execution.completedSteps;
  state.execution.totalSteps = Math.max(step.totalSteps || 0, state.execution.totalSteps || 0);
  state.execution.elapsedMs = Math.max(step.elapsedMs || 0, state.execution.elapsedMs || 0);
  state.execution.activeNodeIds = step.nodeId ? [step.nodeId] : [];
  renderExecutionStatus();
  syncExecutingNodeClasses();
}

function finishExecutionTracking(result, label) {
  stopExecutionTimer();
  state.execution.running = false;
  state.execution.label = label;
  state.execution.completedSteps = (result && result.executed_order && result.executed_order.length) || state.execution.completedSteps;
  state.execution.totalSteps = Math.max(result && result.total_steps ? result.total_steps : 0, state.execution.completedSteps, 1);
  state.execution.elapsedMs = result && typeof result.duration_ms === 'number' ? result.duration_ms : state.execution.elapsedMs;
  state.execution.activeNodeIds = [];
  renderExecutionStatus();
  syncExecutingNodeClasses();
  renderProject();
}

function failExecutionTracking() {
  stopExecutionTimer();
  state.execution.running = false;
  state.execution.activeNodeIds = [];
  renderExecutionStatus();
  syncExecutingNodeClasses();
  renderProject();
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  el.themeLabel.textContent = theme === 'dark' ? '🌙' : '☀️';
  if (state.currentProject) renderProject();
}

function getTheme() {
  return localStorage.getItem('theme') || 'light';
}

function portDef(nodeType, portName, dir) {
  const nt = state.nodeTypesByType[nodeType];
  if (!nt) return null;
  const arr = dir === 'in' ? nt.inputs : nt.outputs;
  return arr.find(p => p.name === portName) || null;
}

function updateViewportTransform() {
  el.nodes.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.zoom})`;
}

function getCompatibleOutputPort(nodeType, inputType) {
  const nt = state.nodeTypesByType[nodeType];
  if (!nt) return null;
  return (nt.outputs || []).find((p) => {
    if (inputType === 'exec') return p.type === 'exec';
    return outputCanProduce(nt, p, inputType);
  }) || null;
}

function getSelectionOverlay() {
  let overlay = el.editor.querySelector('.selection-box');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'selection-box';
    overlay.hidden = true;
    el.editor.appendChild(overlay);
  }
  return overlay;
}

function projectEdgesToIncomingMap(project) {
  const map = new Map();
  for (const e of project.edges) {
    map.set(`${e.to.nodeId}:${e.to.port}`, e);
  }
  return map;
}

function getHiddenInputsForNode(node, nt = state.nodeTypesByType[node.type]) {
  const hidden = new Set();
  if (!nt) return hidden;

  for (const field of (nt.configFields || [])) {
    if (field.type !== 'select') continue;
    const value = node.config[field.key] ?? field.default ?? '';
    const activeOption = (field.options || []).find((opt) => opt.value === value);
    for (const inputName of (activeOption && activeOption.hide_inputs) || []) {
      hidden.add(inputName);
    }
  }

  return hidden;
}

function applyHiddenInputsState(project) {
  if (!project) return false;
  let changed = false;

  for (const node of project.nodes) {
    if (!node.config) node.config = {};
    const hiddenInputs = getHiddenInputsForNode(node);
    if (!hiddenInputs.size) continue;

    const nextEdges = project.edges.filter((edge) => !(edge.to.nodeId === node.id && hiddenInputs.has(edge.to.port)));
    if (nextEdges.length !== project.edges.length) {
      project.edges = nextEdges;
      changed = true;
    }

    for (const inputName of hiddenInputs) {
      if (Object.prototype.hasOwnProperty.call(node.config, inputName)) {
        delete node.config[inputName];
        changed = true;
      }
      const typeKey = `${inputName}__type`;
      if (Object.prototype.hasOwnProperty.call(node.config, typeKey)) {
        delete node.config[typeKey];
        changed = true;
      }
    }
  }

  return changed;
}

function getDynamicOutputType(node, portName, nt = state.nodeTypesByType[node.type]) {
  if (!nt) return null;
  const config = node.config || {};
  for (const field of (nt.configFields || [])) {
    if (field.type !== 'select') continue;
    const value = config[field.key] ?? field.default ?? '';
    const option = (field.options || []).find((opt) => opt.value === value);
    const override = option && option.set_outputs && option.set_outputs[portName];
    if (override) return override;
  }
  return null;
}

function getOutputPortType(node, port, nt) {
  return getDynamicOutputType(node, port.name, nt) || port.type;
}

function outputCanProduce(nt, port, type) {
  if (port.type === type) return true;
  return (nt.configFields || []).some((field) => field.type === 'select'
    && (field.options || []).some((opt) => opt.set_outputs && opt.set_outputs[port.name] === type));
}

function applyOutputOption(node, nt, portName, type) {
  for (const field of (nt.configFields || [])) {
    if (field.type !== 'select') continue;
    const option = (field.options || []).find((opt) => opt.set_outputs && opt.set_outputs[portName] === type);
    if (option) node.config[field.key] = option.value;
  }
}

function applyOutputTypesState(project) {
  let changed = false;
  const nodesById = new Map(project.nodes.map((n) => [n.id, n]));
  const nextEdges = [];
  for (const edge of project.edges) {
    const source = nodesById.get(edge.from.nodeId);
    const dynamic = source ? getDynamicOutputType(source, edge.from.port) : null;
    if (!dynamic) {
      nextEdges.push(edge);
      continue;
    }
    const target = nodesById.get(edge.to.nodeId);
    const inPort = target ? portDef(target.type, edge.to.port, 'in') : null;
    if (inPort && inPort.type !== 'any' && inPort.type !== dynamic) {
      changed = true;
      continue;
    }
    if (edge.type !== dynamic) {
      edge.type = dynamic;
      changed = true;
    }
    nextEdges.push(edge);
  }
  if (changed) project.edges = nextEdges;
  return changed;
}

function validateProjectLocal(project) {
  const normalizedHiddenInputs = applyHiddenInputsState(project);
  const normalizedOutputTypes = applyOutputTypesState(project);
  const errors = [];
  const incoming = projectEdgesToIncomingMap(project);
  const startNodes = project.nodes.filter(n => n.type === 'start');

  if (startNodes.length !== 1 || startNodes[0].id !== 'start') {
    errors.push({ nodeId: null, message: 'Debe existir exactamente un nodo Start fijo.' });
  }

  for (const n of project.nodes) {
    const nt = state.nodeTypesByType[n.type];
    if (!nt) continue;
    const hiddenInputs = getHiddenInputsForNode(n, nt);

    // Entradas requeridas (no-exec): deben tener conexión o valor en config
    for (const p of (nt.inputs || [])) {
      if (hiddenInputs.has(p.name)) continue;
      if (!p.required) continue;
      if (p.type === 'exec') continue;
      const edge = incoming.get(`${n.id}:${p.name}`);
      const hasCfg = n.config && n.config[p.name] !== undefined && n.config[p.name] !== null;
      if (!edge && !hasCfg) {
        errors.push({ nodeId: n.id, message: `Falta valor requerido en '${p.name}'` });
      }
    }

    if (n.type === 'math_expr') {
      const ea = incoming.get(`${n.id}:a`);
      const eb = incoming.get(`${n.id}:b`);
      if (!hiddenInputs.has('b') && ea && eb && ea.type !== eb.type) {
        errors.push({ nodeId: n.id, message: "Las entradas 'a' y 'b' deben ser del mismo tipo cuando ambas están conectadas." });
      }
    }

    if (n.type === 'for') {
      const eEnd = incoming.get(`${n.id}:end`);
      const hasConfig = n.config && n.config.end !== undefined && n.config.end !== null;
      if (!eEnd && !hasConfig) {
        errors.push({ nodeId: n.id, message: "El puerto 'end' es obligatorio" });
      }
    }

    if (n.type === 'delay') {
      const raw = n.config && n.config.delay;
      if (raw !== undefined && raw !== null && raw !== '') {
        const value = Number(raw);
        if (!Number.isInteger(value)) {
          errors.push({ nodeId: n.id, message: 'El valor de delay debe ser un entero' });
        } else if (value < 0) {
          errors.push({ nodeId: n.id, message: 'El valor de delay no puede ser negativo' });
        }
      }
    }
  }

  const byNode = new Map();
  for (const e of errors) {
    if (!byNode.has(e.nodeId)) byNode.set(e.nodeId, []);
    byNode.get(e.nodeId).push(e.message);
  }
  state.localErrorsByNode = byNode;
  return normalizedHiddenInputs || normalizedOutputTypes;
}

function hasBlockingErrors() {
  return state.localErrorsByNode.size > 0;
}

function renderTabs() {
  el.tabs.innerHTML = '';
  for (const p of state.projects) {
    const tab = document.createElement('div');
    tab.className = `tab ${state.currentProject && state.currentProject.id === p.id ? 'active' : ''}`;

    const name = document.createElement('div');
    name.className = 'tab-name';
    name.textContent = p.name;

    const kebab = document.createElement('div');
    kebab.className = 'tab-kebab';
    kebab.textContent = '⋯';

    tab.appendChild(name);
    tab.appendChild(kebab);

    tab.addEventListener('click', async (ev) => {
      if (ev.target === kebab) return;
      await openProject(p.id);
    });

    kebab.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openProjectMenu(p.id, kebab);
    });

    el.tabs.appendChild(tab);
  }
}

function closeMenus() {
  document.querySelectorAll('.menu').forEach(m => m.remove());
}

function openMenu(anchorEl, items) {
  closeMenus();
  const r = anchorEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.style.left = `${Math.min(window.innerWidth - 240, r.left)}px`;
  menu.style.top = `${r.bottom + 6}px`;

  for (const it of items) {
    if (it === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'menu-item';
    row.textContent = it.label;
    row.addEventListener('click', () => {
      closeMenus();
      it.onClick();
    });
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  const onDown = (e) => {
    if (!menu.contains(e.target)) {
      closeMenus();
      document.removeEventListener('pointerdown', onDown, true);
    }
  };
  document.addEventListener('pointerdown', onDown, true);
}

function openProjectMenu(projectId, anchor) {
  const p = state.projects.find(x => x.id === projectId);
  if (!p) return;

  openMenu(anchor, [
    {
      label: 'Renombrar',
      onClick: () => beginRenameProject(projectId),
    },
    {
      label: 'Duplicar',
      onClick: async () => {
        try {
          const np = await api.duplicateProject(projectId);
          await refreshProjects(np.id);
          toast('Proyecto', 'Duplicado', 'success');
        } catch (e) {
          toast('Error', e.message, 'error');
        }
      },
    },
    {
      label: 'Exportar JSON',
      onClick: () => {
        window.location.href = `/api/projects/${encodeURIComponent(projectId)}/export`;
      },
    },
    'sep',
    {
      label: 'Eliminar pestaña',
      onClick: async () => {
        if (!(await confirmModal('¿Eliminar este proyecto?'))) return;
        try {
          await api.deleteProject(projectId);
          await refreshProjects();
          toast('Proyecto', 'Eliminado', 'success');
        } catch (e) {
          toast('Error', e.message, 'error');
        }
      },
    },
  ]);
}

async function beginRenameProject(projectId) {
  const tabEls = Array.from(el.tabs.children);
  const idx = state.projects.findIndex(p => p.id === projectId);
  const tabEl = tabEls[idx];
  if (!tabEl) return;

  const nameEl = tabEl.querySelector('.tab-name');
  const old = nameEl.textContent;

  const input = document.createElement('input');
  input.className = 'input';
  input.value = old;
  input.style.height = '28px';
  input.style.padding = '4px 8px';
  input.style.borderRadius = '10px';
  input.style.maxWidth = '220px';

  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = async (commit) => {
    const newName = (input.value || '').trim() || old;
    const div = document.createElement('div');
    div.className = 'tab-name';
    div.textContent = commit ? newName : old;
    input.replaceWith(div);

    if (commit && state.currentProject && state.currentProject.id === projectId) {
      state.currentProject.name = newName;
      try {
        await api.saveProject(state.currentProject);
      } catch (e) {
        toast('Error', e.message, 'error');
      }
    }
    await refreshProjects(projectId);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function refreshProjects(openId) {
  state.projects = await api.listProjects();
  renderTabs();
  if (openId) await openProject(openId);
  else if (state.projects.length && !state.currentProject) await openProject(state.projects[0].id);
}

async function openProject(id) {
  try {
    await stopDebug();
    state.currentProject = await api.getProject(id);
    state.selectedNodeId = null;
    state.selectedNodeIds = [];
    state.viewport = { x: 0, y: 0 };
    state.zoom = 1;
    const normalizedHiddenInputs = validateProjectLocal(state.currentProject);
    renderTabs();
    renderProject();
    if (normalizedHiddenInputs) saveProjectDebounced();
  } catch (e) {
    toast('Error', e.message, 'error');
  }
}

let saveTimer = null;
function syncProjectSummaryFromCurrent() {
  if (!state.currentProject) return;
  const summary = state.projects.find(p => p.id === state.currentProject.id);
  if (summary) summary.name = state.currentProject.name;
}

function saveProjectDebounced() {
  if (!state.currentProject) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const project = state.currentProject;
    try {
      validateProjectLocal(project);
      syncProjectSummaryFromCurrent();
      await api.saveProject(project);
      renderTabs();
    } catch (e) {
      toast('Guardar', e.message, 'error');
    }
  }, 250);
}

function renderProject() {
  if (!state.currentProject) return;
  el.projectHint.textContent = `${state.currentProject.nodes.length} nodos · ${state.currentProject.edges.length} rutas`;
  el.runProjectBtn.disabled = hasBlockingErrors() || state.execution.running || state.debug.active;
  renderDebugControls();
  renderExecutionStatus();
  updateViewportTransform();

  renderNodes();
  renderWires();
  renderInspector();
}

function nodeTitle(node) {
  const nt = state.nodeTypesByType[node.type];
  return nt ? nt.title : node.type;
}

function isLockedNode(node) {
  return node.type === 'start' || node.locked;
}

function isInteractiveTarget(target) {
  return Boolean(target.closest('input, select, textarea, button, .resize-handle'));
}

function worldPointFromClient(clientX, clientY) {
  const r = el.editor.getBoundingClientRect();
  return {
    x: Math.round((clientX - r.left - state.viewport.x) / state.zoom),
    y: Math.round((clientY - r.top - state.viewport.y) / state.zoom),
  };
}

function screenPointFromClient(clientX, clientY) {
  const r = el.editor.getBoundingClientRect();
  return {
    x: Math.round(clientX - r.left),
    y: Math.round(clientY - r.top),
  };
}

function getCompatibleInputPort(nodeType, outputType) {
  const nt = state.nodeTypesByType[nodeType];
  if (!nt) return null;
  return (nt.inputs || []).find((p) => {
    if (outputType === 'exec') return p.type === 'exec';
    return p.type === outputType || p.type === 'any';
  }) || null;
}

function getNodeAccent(node) {
  return NODE_COLOR_MAP[node.color || ''] || 'transparent';
}

function getNodeFill(node) {
  const accent = NODE_COLOR_MAP[node.color || ''];
  if (!accent) return 'var(--panel)';
  const alpha = getTheme() === 'dark' ? 0.18 : 0.14;
  return hexToRgba(accent, alpha);
}

function setNodeColor(nodeId, color) {
  const node = state.currentProject && state.currentProject.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  node.color = color || null;
  updateNodeAndSave();
}

function updateNodeAndSave() {
  validateProjectLocal(state.currentProject);
  renderProject();
  saveProjectDebounced();
}

function connectPorts(fromNodeId, fromPort, fromType, toNodeId, toPort) {
  if (!state.currentProject) return false;

  const targetNode = state.currentProject.nodes.find(n => n.id === toNodeId);
  const inDef = portDef(targetNode?.type, toPort, 'in');
  if (!targetNode || !inDef) return false;
  if (getHiddenInputsForNode(targetNode).has(toPort)) {
    toast('Conexión', 'La entrada está desactivada por la opción actual del nodo', 'error');
    return false;
  }
  if (inDef.type !== 'any' && inDef.type !== fromType) {
    toast('Conexión', 'Tipos incompatibles', 'error');
    return false;
  }

  state.currentProject.edges = state.currentProject.edges.filter(e => !(e.to.nodeId === toNodeId && e.to.port === toPort));
  state.currentProject.edges.push({
    id: uid('e'),
    from: { nodeId: fromNodeId, port: fromPort },
    to: { nodeId: toNodeId, port: toPort },
    type: fromType,
  });
  updateNodeAndSave();
  return true;
}

function buildScalarEditor(node, key, type, value, onAfterChange) {
  if (type === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value ?? false);
    input.addEventListener('change', () => {
      node.config[key] = input.checked;
      onAfterChange();
    });
    return input;
  }

  const input = document.createElement('input');
  input.className = 'input';
  input.type = (type === 'int' || type === 'float') ? 'number' : 'text';
  input.value = value === undefined || value === null
    ? ''
    : (typeof value === 'object' ? JSON.stringify(value) : String(value));
  if (type === 'string') {
    input.addEventListener('input', () => {
      node.config[key] = input.value;
      validateProjectLocal(state.currentProject);
      el.runProjectBtn.disabled = hasBlockingErrors() || state.debug.active;
      const nodeEl = el.nodes.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
      if (nodeEl) nodeEl.classList.toggle('error', state.localErrorsByNode.has(node.id));
      saveProjectDebounced();
    });
  }
  input.addEventListener('change', () => {
    const raw = input.value;
    if (type === 'int') node.config[key] = raw === '' ? null : parseInt(raw, 10);
    else if (type === 'float') node.config[key] = raw === '' ? null : parseFloat(raw);
    else if (type === 'list' || type === 'bytes' || type === 'image' || type === 'vector2') {
      if (raw === '') {
        node.config[key] = null;
      } else {
        try {
          node.config[key] = JSON.parse(raw);
        } catch {
          toast('Entrada', 'JSON inválido', 'error');
          return;
        }
      }
    } else {
      node.config[key] = raw;
    }
    onAfterChange();
  });
  return input;
}

function createNodeField(labelText, control, compact = false) {
  const field = document.createElement('label');
  field.className = `node-field${compact ? ' compact' : ''}`;

  const label = document.createElement('div');
  label.className = 'node-field-label';
  label.textContent = labelText;

  field.appendChild(label);
  if (control instanceof HTMLElement) field.appendChild(control);
  return field;
}

function renderInlineEditors(node, nt, parent) {
  if (!nt) return;
  const incoming = projectEdgesToIncomingMap(state.currentProject);
  const configKeys = new Set((nt.configFields || []).map(f => f.key));
  const hiddenInputs = getHiddenInputsForNode(node, nt);
  const box = document.createElement('div');
  box.className = 'node-inline';

  for (const f of (nt.configFields || [])) {
    // Un campo de configuración con el mismo nombre que una entrada conectada se oculta.
    if (incoming.get(`${node.id}:${f.key}`)) continue;
    if (!isFieldVisible(f, node)) continue;
    let control;
    if (f.type === 'select') {
      const select = document.createElement('select');
      select.className = 'select';
      for (const opt of f.options || []) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      }
      select.value = node.config[f.key] ?? f.default ?? '';
      select.addEventListener('change', () => {
        node.config[f.key] = select.value;
        onConfigFieldChanged(node, f);
        updateNodeAndSave();
      });
      control = select;
    } else if (f.type === 'typed_value') {
      control = buildVariableValueEditor(node);
    } else {
      control = buildScalarEditor(node, f.key, f.type, node.config[f.key] ?? f.default, updateNodeAndSave);
    }
    const compact = f.type === 'boolean' || (f.type === 'typed_value' && node.config.var_type === 'boolean');
    box.appendChild(createNodeField(f.label, control, compact));
  }

  for (const p of (nt.inputs || [])) {
    if (p.type === 'exec' || configKeys.has(p.name)) continue;
    if (hiddenInputs.has(p.name)) continue;
    if (incoming.get(`${node.id}:${p.name}`)) continue;

    if (p.type === 'any') {
      const wrap = document.createElement('div');
      wrap.className = 'node-field';

      const label = document.createElement('div');
      label.className = 'node-field-label';
      label.textContent = `${p.name}`;
      wrap.appendChild(label);

      const row = document.createElement('div');
      row.className = 'node-any-editor';
      const typeKey = `${p.name}__type`;
      const typeSelect = document.createElement('select');
      typeSelect.className = 'select';
      ['boolean', 'int', 'float', 'string', 'list', 'vector2'].forEach((typeName) => {
        const option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        typeSelect.appendChild(option);
      });
      typeSelect.value = node.config[typeKey] || 'string';

      const holder = document.createElement('div');
      holder.className = 'node-any-editor-value';
      const renderAny = () => {
        node.config[typeKey] = typeSelect.value;
        holder.innerHTML = '';
        holder.appendChild(buildScalarEditor(node, p.name, typeSelect.value, node.config[p.name], updateNodeAndSave));
      };
      typeSelect.addEventListener('change', () => {
        node.config[p.name] = null;
        renderAny();
        updateNodeAndSave();
      });
      renderAny();

      row.appendChild(typeSelect);
      row.appendChild(holder);
      wrap.appendChild(row);
      box.appendChild(wrap);
      continue;
    }

    const control = buildScalarEditor(node, p.name, p.type, node.config[p.name], updateNodeAndSave);
    box.appendChild(createNodeField(p.name, control, p.type === 'boolean'));
  }

  if (box.children.length) parent.appendChild(box);
}

function renderNodes() {
  el.nodes.innerHTML = '';
  for (const n of state.currentProject.nodes) {
    const nt = state.nodeTypesByType[n.type];
    const hiddenInputs = getHiddenInputsForNode(n, nt);
    const nodeEl = document.createElement('div');
    nodeEl.className = 'node';
    nodeEl.style.left = `${n.x}px`;
    nodeEl.style.top = `${n.y}px`;
    nodeEl.style.width = `${Math.max(n.width || (n.type === 'start' ? 220 : 280), 220)}px`;
    nodeEl.style.setProperty('--node-accent', getNodeAccent(n));
    nodeEl.style.setProperty('--node-fill', getNodeFill(n));
    nodeEl.dataset.nodeId = n.id;

    if (n.id === state.selectedNodeId || state.selectedNodeIds.includes(n.id)) nodeEl.classList.add('selected');
    if (state.localErrorsByNode.has(n.id)) nodeEl.classList.add('error');
    if (isLockedNode(n)) nodeEl.classList.add('locked');
    if (state.execution.activeNodeIds.includes(n.id)) nodeEl.classList.add('executing');
    if (state.debug.active) {
      if (state.debug.executedNodeIds.includes(n.id)) nodeEl.classList.add('debug-done');
      if (state.debug.nextNodeId === n.id) nodeEl.classList.add('debug-next');
    }

    const header = document.createElement('div');
    header.className = 'node-header';

    const title = document.createElement('div');
    title.className = 'node-title';
    title.textContent = nodeTitle(n);

    const actions = document.createElement('div');
    actions.className = 'node-actions';

    const canRun = (nt && nt.inputs.some(p => p.type === 'exec'));
    if (canRun) {
      const runBtn = document.createElement('button');
      runBtn.className = 'small-btn';
      runBtn.textContent = 'Run';
      runBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await runNode(n.id);
      });
      runBtn.disabled = state.execution.running || (hasBlockingErrors() && isErrorInDependency(n.id));
      actions.appendChild(runBtn);
    }

    if (!isLockedNode(n)) {
      const kebab = document.createElement('button');
      kebab.className = 'kebab';
      kebab.textContent = '⋯';
      kebab.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openNodeMenu(n.id, kebab);
      });
      actions.appendChild(kebab);
    }

    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'node-body';

    const inCol = document.createElement('div');
    inCol.className = 'ports';
    const outCol = document.createElement('div');
    outCol.className = 'ports';

    for (const p of (nt ? nt.inputs : [])) {
      const row = portRow(n, p, 'in', { disabled: hiddenInputs.has(p.name) });
      inCol.appendChild(row);
    }
    for (const p of (nt ? nt.outputs : [])) {
      const row = portRow(n, { ...p, type: getOutputPortType(n, p, nt) }, 'out', { disabled: false });
      outCol.appendChild(row);
    }

    body.appendChild(inCol);
    body.appendChild(outCol);

    nodeEl.appendChild(header);
    nodeEl.appendChild(body);
    renderInlineEditors(n, nt, nodeEl);

    if (!isLockedNode(n)) {
      ['x', 'y', 'xy'].forEach((axis) => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${axis}`;
        handle.addEventListener('pointerdown', (ev) => startResizeNode(ev, n.id, axis));
        nodeEl.appendChild(handle);
      });
    }

    nodeEl.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.ctrlKey) return;
      if (ev.target.closest('.port-hitbox')) return;
      if (isInteractiveTarget(ev.target)) return;
      if (isLockedNode(n) && ev.target.closest('.node-inline')) return;
      if (!state.selectedNodeIds.includes(n.id)) selectNode(n.id);
      startDragNode(ev, n.id);
    });

    nodeEl.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
    });

    el.nodes.appendChild(nodeEl);

    const minHeight = Math.max(nodeEl.scrollHeight, n.type === 'start' ? 96 : 120);
    nodeEl.style.minHeight = `${minHeight}px`;
    if (n.height) nodeEl.style.height = `${Math.max(n.height, minHeight)}px`;
  }
}

function portRow(node, port, dir, options = {}) {
  const disabled = Boolean(options.disabled);
  const row = document.createElement('div');
  row.className = `port ${dir === 'out' ? 'out' : ''}${disabled ? ' disabled' : ''}`;
  row.dataset.nodeId = node.id;
  row.dataset.port = port.name;

  const hitbox = document.createElement('div');
  hitbox.className = `port-hitbox${disabled ? ' disabled' : ''}`;
  hitbox.dataset.type = port.type;
  hitbox.dataset.nodeId = node.id;
  hitbox.dataset.port = port.name;
  hitbox.dataset.dir = dir;

  const dot = document.createElement('div');
  dot.className = 'port-dot';
  dot.style.color = ROUTE_COLORS[port.type] || 'var(--wire-exec)';
  hitbox.appendChild(dot);

  if (!disabled) {
    hitbox.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (ev.button !== 0) return;
      if (dir === 'out') startConnectionDrag(ev, node.id, port.name, port.type);
      else startInputConnectionDrag(ev, node.id, port.name, port.type);
    });
  }

  const name = document.createElement('div');
  name.className = 'port-name';
  name.textContent = port.name;

  if (dir === 'in') {
    row.appendChild(hitbox);
    row.appendChild(name);
  } else {
    row.appendChild(name);
    row.appendChild(hitbox);
  }

  return row;
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  state.selectedNodeIds = nodeId ? [nodeId] : [];
  renderProject();
}

function startDragNode(ev, nodeId) {
  const selectedIds = state.selectedNodeIds.includes(nodeId) ? state.selectedNodeIds : [nodeId];
  const nodes = state.currentProject.nodes.filter(n => selectedIds.includes(n.id));
  if (!nodes.length) return;

  const startX = ev.clientX;
  const startY = ev.clientY;
  const baseMap = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

  const onMove = (e) => {
    const dx = (e.clientX - startX) / state.zoom;
    const dy = (e.clientY - startY) / state.zoom;
    for (const node of nodes) {
      const base = baseMap.get(node.id);
      node.x = Math.round(base.x + dx);
      node.y = Math.round(base.y + dy);
      const nodeEl = el.nodes.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
      if (nodeEl) {
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;
      }
    }
    renderWires();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    saveProjectDebounced();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function markConnecting() {
  document.querySelectorAll('.port-hitbox').forEach(d => d.classList.remove('connecting'));
  if (!state.connecting) return;
  const dot = state.connecting.mode === 'input'
    ? el.nodes.querySelector(`.port-hitbox[data-node-id="${CSS.escape(state.connecting.toNodeId)}"][data-port="${CSS.escape(state.connecting.toPort)}"][data-dir="in"]`)
    : el.nodes.querySelector(`.port-hitbox[data-node-id="${CSS.escape(state.connecting.fromNodeId)}"][data-port="${CSS.escape(state.connecting.fromPort)}"][data-dir="out"]`);
  if (dot) dot.classList.add('connecting');
}

function portCenter(nodeId, portName, dir) {
  const dot = el.nodes.querySelector(`.port-hitbox[data-node-id="${CSS.escape(nodeId)}"][data-port="${CSS.escape(portName)}"][data-dir="${dir}"]`);
  if (!dot) return null;
  const rect = dot.getBoundingClientRect();
  const editorRect = el.editor.getBoundingClientRect();
  return {
    x: rect.left - editorRect.left + rect.width / 2,
    y: rect.top - editorRect.top + rect.height / 2,
  };
}

function startConnectionDrag(ev, nodeId, portName, portType) {
  if (!state.currentProject) return;
  state.connecting = {
    mode: 'output',
    fromNodeId: nodeId,
    fromPort: portName,
    fromType: portType,
    pointer: screenPointFromClient(ev.clientX, ev.clientY),
  };
  markConnecting();
  renderWires();

  const onMove = (e) => {
    state.connecting.pointer = screenPointFromClient(e.clientX, e.clientY);
    renderWires();
  };

  const onUp = (e) => {
    const active = state.connecting;
    state.connecting = null;
    markConnecting();

    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);

    const world = worldPointFromClient(e.clientX, e.clientY);
    state.mouse.x = world.x;
    state.mouse.y = world.y;

    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port-hitbox[data-dir="in"]');
    if (target && active) {
      connectPorts(active.fromNodeId, active.fromPort, active.fromType, target.dataset.nodeId, target.dataset.port);
      return;
    }

    renderWires();
    if (!active) return;
    const hasOutgoing = state.currentProject.edges.some(edge => edge.from.nodeId === active.fromNodeId && edge.from.port === active.fromPort);
    if (!hasOutgoing) {
      openPalette({ connectFrom: active, position: { ...world } });
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function startInputConnectionDrag(ev, nodeId, portName, portType) {
  if (!state.currentProject) return;
  const existing = state.currentProject.edges.find((edge) => edge.to.nodeId === nodeId && edge.to.port === portName) || null;
  if (existing) {
    state.currentProject.edges = state.currentProject.edges.filter((edge) => edge.id !== existing.id);
    validateProjectLocal(state.currentProject);
    renderProject();
  }

  state.connecting = {
    mode: 'input',
    toNodeId: nodeId,
    toPort: portName,
    toType: portType,
    hadExisting: Boolean(existing),
    pointer: screenPointFromClient(ev.clientX, ev.clientY),
  };
  markConnecting();
  renderWires();

  const onMove = (e) => {
    state.connecting.pointer = screenPointFromClient(e.clientX, e.clientY);
    renderWires();
  };

  const onUp = (e) => {
    const active = state.connecting;
    state.connecting = null;
    markConnecting();

    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);

    const world = worldPointFromClient(e.clientX, e.clientY);
    state.mouse = { ...world };

    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port-hitbox[data-dir="out"]');
    if (target && active) {
      connectPorts(target.dataset.nodeId, target.dataset.port, target.dataset.type, active.toNodeId, active.toPort);
      return;
    }

    renderWires();
    if (!active) return;
    if (active.hadExisting) {
      validateProjectLocal(state.currentProject);
      renderProject();
      saveProjectDebounced();
      return;
    }

    openPalette({ connectTo: active, position: { ...world } });
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function startResizeNode(ev, nodeId, axis) {
  ev.stopPropagation();
  ev.preventDefault();
  const node = state.currentProject.nodes.find(n => n.id === nodeId);
  if (!node) return;
  selectNode(nodeId);

  const startX = ev.clientX;
  const startY = ev.clientY;
  const baseW = Math.max(node.width || 280, 220);
  const baseH = Math.max(node.height || 120, 96);

  const onMove = (e) => {
    if (axis.includes('x')) node.width = Math.max(220, Math.round(baseW + ((e.clientX - startX) / state.zoom)));
    if (axis.includes('y')) node.height = Math.max(96, Math.round(baseH + ((e.clientY - startY) / state.zoom)));
    renderProject();
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    saveProjectDebounced();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function renderWires() {
  if (!state.currentProject) return;
  el.wires.innerHTML = '';

  for (const e of state.currentProject.edges) {
    const fromDir = 'out';
    const toDir = 'in';
    const a = portCenter(e.from.nodeId, e.from.port, fromDir);
    const b = portCenter(e.to.nodeId, e.to.port, toDir);
    if (!a || !b) continue;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', ROUTE_COLORS[e.type] || 'var(--wire-exec)');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('opacity', '0.95');
    el.wires.appendChild(path);
  }

  if (state.connecting) {
    const a = state.connecting.mode === 'input'
      ? state.connecting.pointer
      : portCenter(state.connecting.fromNodeId, state.connecting.fromPort, 'out');
    const b = state.connecting.mode === 'input'
      ? portCenter(state.connecting.toNodeId, state.connecting.toPort, 'in')
      : state.connecting.pointer;
    if (a && b) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
      path.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', ROUTE_COLORS[(state.connecting.fromType || state.connecting.toType)] || 'var(--wire-exec)');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-dasharray', '8 6');
      path.setAttribute('opacity', '0.9');
      el.wires.appendChild(path);
    }
  }
}

function openNodeMenu(nodeId, anchor) {
  const node = state.currentProject && state.currentProject.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  openMenu(anchor, [
    {
      label: 'Copiar',
      onClick: () => copyNode(nodeId),
    },
    {
      label: 'Duplicar',
      onClick: () => duplicateNode(nodeId, false),
    },
    {
      label: 'Duplicar con entradas',
      onClick: () => duplicateNode(nodeId, true),
    },
    'sep',
    ...NODE_COLOR_OPTIONS.map((opt) => ({
      label: `${node.color === (opt.value || null) || (!node.color && !opt.value) ? '✓ ' : ''}Color: ${opt.label}`,
      onClick: () => setNodeColor(nodeId, opt.value),
    })),
    'sep',
    {
      label: 'Suprimir',
      onClick: () => deleteNode(nodeId),
    },
  ]);
}

function copyNode(nodeId) {
  const n = state.currentProject.nodes.find(x => x.id === nodeId);
  if (!n || isLockedNode(n)) return;
  state.clipboardNode = JSON.parse(JSON.stringify(n));
  toast('Nodo', 'Copiado', 'success');
}

function duplicateNode(nodeId, withInputs) {
  const n = state.currentProject.nodes.find(x => x.id === nodeId);
  if (!n || isLockedNode(n)) return;
  const clone = JSON.parse(JSON.stringify(n));
  clone.id = uid('n');
  clone.x += 24;
  clone.y += 24;

  state.currentProject.nodes.push(clone);

  if (withInputs) {
    const incoming = state.currentProject.edges.filter(e => e.to.nodeId === nodeId);
    for (const e of incoming) {
      state.currentProject.edges.push({
        id: uid('e'),
        from: { ...e.from },
        to: { nodeId: clone.id, port: e.to.port },
        type: e.type,
      });
    }
  }

  validateProjectLocal(state.currentProject);
  selectNode(clone.id);
  renderProject();
  saveProjectDebounced();
}

function deleteNode(nodeId) {
  const node = state.currentProject.nodes.find(n => n.id === nodeId);
  if (!node || isLockedNode(node)) return;
  state.currentProject.nodes = state.currentProject.nodes.filter(n => n.id !== nodeId);
  state.currentProject.edges = state.currentProject.edges.filter(e => e.from.nodeId !== nodeId && e.to.nodeId !== nodeId);
  if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
  validateProjectLocal(state.currentProject);
  renderProject();
  saveProjectDebounced();
}

function isErrorInDependency(targetNodeId) {
  // Si hay error en el propio nodo, lo consideramos dependiente
  if (state.localErrorsByNode.has(targetNodeId)) return true;

  const edges = state.currentProject.edges;
  const visited = new Set([targetNodeId]);
  const stack = [targetNodeId];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of edges) {
      if (e.to.nodeId === cur) {
        const up = e.from.nodeId;
        if (!visited.has(up)) {
          visited.add(up);
          stack.push(up);
        }
      }
    }
  }

  for (const nid of visited) {
    if (state.localErrorsByNode.has(nid)) return true;
  }
  return false;
}

function renderInspector() {
  const project = state.currentProject;
  if (!project) return;

  const node = project.nodes.find(n => n.id === state.selectedNodeId);
  if (!node) {
    el.inspectorBody.innerHTML = '<div class="muted">Selecciona un nodo…</div>';
    return;
  }

  const nt = state.nodeTypesByType[node.type];
  const errors = state.localErrorsByNode.get(node.id) || [];

  const root = document.createElement('div');

  const head = document.createElement('div');
  head.innerHTML = `<div class="muted">Tipo: ${nt ? nt.type : node.type}</div>`;
  root.appendChild(head);

   const note = document.createElement('div');
   note.className = 'muted';
   note.textContent = isLockedNode(node)
     ? 'Nodo protegido. Solo inicia la ejecución.'
     : 'Los valores editables se cambian directamente en el nodo.';
   root.appendChild(note);

  if (errors.length) {
    const ebox = document.createElement('div');
    ebox.style.border = '1px solid var(--border)';
    ebox.style.borderLeft = '4px solid var(--danger)';
    ebox.style.borderRadius = '12px';
    ebox.style.padding = '8px 10px';
    ebox.innerHTML = `<div style="font-weight:800">Errores</div><div class="muted" style="white-space:pre-wrap"></div>`;
    ebox.querySelector('.muted').textContent = errors.join('\n');
    root.appendChild(ebox);
  }

  renderDebugValues(node, root);

  el.inspectorBody.innerHTML = '';
  el.inspectorBody.appendChild(root);
}

let paletteHideTimer = null;

function openPalette(context = null) {
  window.clearTimeout(paletteHideTimer);
  state.paletteContext = context;
  el.palette.hidden = false;
  el.palette.getBoundingClientRect();
  el.palette.classList.add('show');
  el.paletteSearch.value = '';
  renderPaletteList('');
  setTimeout(() => {
    el.paletteSearch.focus();
  }, 0);
}

function closePalette() {
  state.paletteContext = null;
  el.palette.classList.remove('show');
  window.clearTimeout(paletteHideTimer);
  paletteHideTimer = window.setTimeout(() => {
    el.palette.hidden = true;
  }, MODAL_FADE_MS);
}

function renderPaletteList(query) {
  const q = (query || '').toLowerCase();
  el.paletteList.innerHTML = '';
  const connectFrom = state.paletteContext && state.paletteContext.connectFrom;
  const connectTo = state.paletteContext && state.paletteContext.connectTo;
  const list = state.nodeTypes.filter((nt) => {
    if (nt.type === 'start') return false;
    const matchesQuery = nt.title.toLowerCase().includes(q) || nt.type.toLowerCase().includes(q);
    if (!matchesQuery) return false;
    if (connectFrom) return Boolean(getCompatibleInputPort(nt.type, connectFrom.fromType));
    if (connectTo) return Boolean(getCompatibleOutputPort(nt.type, connectTo.toType));
    return true;
  });
  for (const nt of list) {
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.innerHTML = `<div class="palette-item-title"></div><div class="palette-item-desc"></div>`;
    item.querySelector('.palette-item-title').textContent = nt.title;
    item.querySelector('.palette-item-desc').textContent = nt.description || nt.type;
    item.addEventListener('click', () => {
      const pos = state.paletteContext && state.paletteContext.position ? state.paletteContext.position : state.mouse;
      addNode(nt.type, pos.x, pos.y);
      closePalette();
    });
    el.paletteList.appendChild(item);
  }
}

function addNode(type, x, y) {
  if (type === 'start') return;
  const nt = state.nodeTypesByType[type];
  const node = {
    id: uid('n'),
    type,
    x,
    y,
    width: 280,
    height: 120,
    config: {},
  };

  // aplicar defaults
  for (const f of (nt.configFields || [])) {
    if (f.default !== undefined) node.config[f.key] = f.default;
  }

  state.currentProject.nodes.push(node);
  const pending = state.paletteContext && state.paletteContext.connectFrom;
  if (pending) {
    const port = getCompatibleInputPort(type, pending.fromType);
    if (port) {
      state.currentProject.edges = state.currentProject.edges.filter(e => !(e.to.nodeId === node.id && e.to.port === port.name));
      state.currentProject.edges.push({
        id: uid('e'),
        from: { nodeId: pending.fromNodeId, port: pending.fromPort },
        to: { nodeId: node.id, port: port.name },
        type: pending.fromType,
      });
    }
  }
  const pendingInput = state.paletteContext && state.paletteContext.connectTo;
  if (pendingInput) {
    const port = getCompatibleOutputPort(type, pendingInput.toType);
    if (port) {
      applyOutputOption(node, nt, port.name, pendingInput.toType);
      state.currentProject.edges = state.currentProject.edges.filter(e => !(e.to.nodeId === pendingInput.toNodeId && e.to.port === pendingInput.toPort));
      state.currentProject.edges.push({
        id: uid('e'),
        from: { nodeId: node.id, port: port.name },
        to: { nodeId: pendingInput.toNodeId, port: pendingInput.toPort },
        type: getOutputPortType(node, port, nt),
      });
    }
  }
  validateProjectLocal(state.currentProject);
  selectNode(node.id);
  renderProject();
  saveProjectDebounced();
}

async function runProject() {
  if (!state.currentProject) return;
  startExecutionTracking('Ejecutando proyecto');
  try {
    const res = await api.streamExecuteProject(state.currentProject.id, (event) => {
      if (event.type === 'step' && event.step) updateExecutionStep(event.step);
    });
    finishExecutionTracking(res, 'Proyecto completado');
    if (res.console && res.console.length) appendConsole(res.console);
    if (res.notifications) res.notifications.forEach(m => toast('Alert', m, 'success'));
  } catch (e) {
    failExecutionTracking();
    const errors = e.data && e.data.errors ? e.data.errors.map(x => x.message).join('\n') : e.message;
    toast('Ejecución', errors, 'error');
  }
}

function renderDebugControls() {
  const d = state.debug;
  el.debugProjectBtn.hidden = d.active;
  el.debugProjectBtn.disabled = hasBlockingErrors() || state.execution.running;
  el.debugControls.hidden = !d.active;
  if (!d.active) return;
  el.debugStepBtn.disabled = d.busy || d.finished;
  el.debugRepeatBtn.disabled = d.busy || !d.canRepeat;
  const next = d.nextNodeId && state.currentProject
    ? state.currentProject.nodes.find(n => n.id === d.nextNodeId)
    : null;
  el.debugStatus.textContent = d.finished ? 'Depuración finalizada' : (next ? `Siguiente: ${nodeTitle(next)}${d.nextIsInput ? ' (entrada)' : ''}` : '');
}

function applyDebugState(s) {
  const d = state.debug;
  d.active = true;
  d.finished = Boolean(s.finished);
  d.canRepeat = Boolean(s.canRepeat);
  d.nextNodeId = s.nextNodeId || null;
  d.nextIsInput = Boolean(s.nextIsInput);
  d.executedNodeIds = s.executedNodeIds || [];
  d.nodeValues = {};
  d.pending = new Set();
  d.version += 1;
  el.console.textContent = (s.console || []).join('\n');
  el.console.scrollTop = el.console.scrollHeight;
  (s.newNotifications || []).forEach(m => toast('Alert', m, 'success'));
  renderProject();
}

function resetDebugState() {
  Object.assign(state.debug, {
    active: false,
    busy: false,
    finished: false,
    canRepeat: false,
    nextNodeId: null,
    executedNodeIds: [],
    nodeValues: {},
    pending: new Set(),
  });
  state.debug.version += 1;
}

async function startDebug() {
  if (!state.currentProject || state.debug.active) return;
  clearConsole();
  try {
    applyDebugState(await api.debugStart(state.currentProject.id));
  } catch (e) {
    const errors = e.data && e.data.errors ? e.data.errors.map(x => x.message).join('\n') : e.message;
    toast('Depuración', errors, 'error');
  }
}

async function debugAction(call) {
  if (!state.currentProject || !state.debug.active || state.debug.busy) return;
  state.debug.busy = true;
  renderDebugControls();
  try {
    applyDebugState(await call(state.currentProject.id));
  } catch (e) {
    if (e.data && e.data.state) applyDebugState(e.data.state);
    const errors = e.data && e.data.errors ? e.data.errors.map(x => x.message).join('\n') : e.message;
    toast('Depuración', errors, 'error');
  } finally {
    state.debug.busy = false;
    renderDebugControls();
  }
}

async function stopDebug() {
  if (!state.debug.active) return;
  const projectId = state.currentProject && state.currentProject.id;
  resetDebugState();
  if (projectId) await api.debugStop(projectId).catch(() => {});
  renderProject();
}

async function loadDebugNodeValues(nodeId) {
  const d = state.debug;
  if (d.pending.has(nodeId) || !state.currentProject) return;
  d.pending.add(nodeId);
  const version = d.version;
  let data;
  try {
    data = await api.debugNode(state.currentProject.id, nodeId);
  } catch (e) {
    data = { executed: true, inputs: [], outputs: [], error: e.message };
  }
  if (version !== d.version) return;
  d.nodeValues[nodeId] = data;
  if (state.selectedNodeId === nodeId) renderInspector();
}

function debugValuesText(data) {
  const fmt = (rows) => rows.map(r => `${r.name}: ${r.full ?? r.value}`).join('\n');
  return `ENTRADAS:\n${fmt(data.inputs)}\nSALIDAS:\n${fmt(data.outputs)}`;
}

async function copyDebugValues(data) {
  try {
    await navigator.clipboard.writeText(debugValuesText(data));
    toast('Copiar', 'Valores copiados al portapapeles', 'success');
  } catch (e) {
    toast('Copiar', 'No se pudo copiar al portapapeles', 'error');
  }
}

const MODAL_FADE_MS = 180;

function domEl(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function openModal({ title, onClose = null }) {
  const backdrop = domEl('div', 'modal-backdrop');
  const modal = domEl('div', 'modal');
  const head = domEl('div', 'modal-head');
  const closeBtn = domEl('button', 'btn btn-small', 'Cerrar');
  head.appendChild(domEl('div', 'modal-title', title));
  head.appendChild(closeBtn);
  const body = domEl('div', 'modal-body');
  const footer = domEl('div', 'modal-footer');
  modal.appendChild(head);
  modal.appendChild(body);
  modal.appendChild(footer);
  backdrop.appendChild(modal);

  let closed = false;
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    const stack = document.querySelectorAll('.modal-backdrop');
    if (stack[stack.length - 1] !== backdrop) return;
    e.stopPropagation();
    close();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    backdrop.classList.remove('show');
    window.setTimeout(() => backdrop.remove(), MODAL_FADE_MS);
    if (onClose) onClose();
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  backdrop.getBoundingClientRect();
  backdrop.classList.add('show');
  return { body, footer, close };
}

function confirmModal(message, confirmLabel = 'Eliminar') {
  return new Promise((resolve) => {
    let accepted = false;
    const m = openModal({ title: 'Confirmar', onClose: () => resolve(accepted) });
    m.body.appendChild(domEl('div', '', message));
    const cancel = domEl('button', 'btn', 'Cancelar');
    cancel.addEventListener('click', m.close);
    const ok = domEl('button', 'btn', confirmLabel);
    ok.addEventListener('click', () => {
      accepted = true;
      m.close();
    });
    m.footer.appendChild(cancel);
    m.footer.appendChild(ok);
  });
}

// ---- Variables: tipos, valores y modal de configuración de listas/diccionarios ----

const BASIC_VAR_TYPES = ['string', 'int', 'float', 'boolean'];

function defaultVariableValue(varType) {
  if (varType === 'int' || varType === 'float') return 0;
  if (varType === 'boolean') return false;
  if (varType === 'list' || varType === 'dict') return [];
  return '';
}

function onConfigFieldChanged(node, field) {
  if (node.type === 'variable' && (field.key === 'var_type' || field.key === 'list_subtype')) {
    node.config.op = defaultVariableValue(node.config.var_type || 'string');
  }
}

function isFieldVisible(field, node) {
  const nt = state.nodeTypesByType[node.type];
  return Object.entries(field.visibleWhen || {}).every(([key, allowed]) => {
    const other = ((nt && nt.configFields) || []).find((f) => f.key === key);
    const current = node.config[key] ?? (other ? other.default : undefined);
    return allowed.includes(current);
  });
}

function buildVariableValueEditor(node) {
  const varType = node.config.var_type || 'string';
  if (varType !== 'list' && varType !== 'dict') {
    return buildScalarEditor(node, 'op', varType, node.config.op, updateNodeAndSave);
  }
  const count = Array.isArray(node.config.op) ? node.config.op.length : 0;
  const wrap = domEl('div', 'variable-summary');
  const label = varType === 'dict'
    ? `${count} ${count === 1 ? 'entrada' : 'entradas'}`
    : `${count} ${count === 1 ? 'elemento' : 'elementos'} (${node.config.list_subtype || 'string'})`;
  wrap.appendChild(domEl('span', 'muted', label));
  const btn = domEl('button', 'small-btn', 'Configurar');
  btn.addEventListener('click', () => openVariableModal(node));
  wrap.appendChild(btn);
  return wrap;
}

function rawFromValue(type, value) {
  if (type === 'boolean') return value === true || value === 'true';
  return value === null || value === undefined ? '' : String(value);
}

function convertRaw(raw, type) {
  if (type === 'boolean') return raw === true || String(raw).toLowerCase() === 'true';
  return typeof raw === 'boolean' ? '' : raw;
}

function coerceRaw(type, raw) {
  const text = String(raw).trim();
  if (type === 'string') return { ok: true, value: String(raw) };
  if (type === 'boolean') return { ok: true, value: raw === true || raw === 'true' };
  if (type === 'int') return /^-?\d+$/.test(text) ? { ok: true, value: parseInt(text, 10) } : { ok: false };
  if (type === 'float') {
    const n = Number(text);
    return text !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }
  return { ok: false };
}

function loadVariableWork(node, varType, subtype) {
  const stored = Array.isArray(node.config.op) ? node.config.op : [];
  const toEntry = (e, withKey) => {
    const type = e && BASIC_VAR_TYPES.includes(e.type) ? e.type : 'string';
    return { key: withKey ? String((e && e.key) ?? '') : '', type, raw: rawFromValue(type, e && e.value) };
  };
  if (varType === 'dict') return stored.map((e) => toEntry(e, true));
  if (BASIC_VAR_TYPES.includes(subtype)) return stored.map((v) => ({ raw: rawFromValue(subtype, v) }));
  return stored.map((inner) => (Array.isArray(inner) ? inner : []).map((e) => toEntry(e, subtype === 'dict')));
}

function serializeVariableWork(varType, subtype, work) {
  const errors = [];
  const entries = (list, withKey, where) => {
    const seen = new Set();
    return list.map((e, i) => {
      const label = `${where} #${i + 1}`;
      if (withKey) {
        if (!e.key) errors.push(`${label}: la clave no puede estar vacía`);
        else if (seen.has(e.key)) errors.push(`${label}: clave duplicada '${e.key}'`);
        seen.add(e.key);
      }
      const r = coerceRaw(e.type, e.raw);
      if (!r.ok) errors.push(`${label}: valor inválido para ${e.type}`);
      const out = { type: e.type, value: r.ok ? r.value : null };
      if (withKey) out.key = e.key;
      return out;
    });
  };

  let value;
  if (varType === 'dict') {
    value = entries(work, true, 'Entrada');
  } else if (BASIC_VAR_TYPES.includes(subtype)) {
    value = work.map((item, i) => {
      const r = coerceRaw(subtype, item.raw);
      if (!r.ok) errors.push(`Elemento #${i + 1}: valor inválido para ${subtype}`);
      return r.ok ? r.value : null;
    });
  } else {
    const kind = subtype === 'dict' ? 'Diccionario' : 'Lista';
    value = work.map((inner, i) => entries(inner, subtype === 'dict', `${kind} ${i + 1}, entrada`));
  }
  return { errors, value };
}

function buildEntryRow({ entry, withKey, fixedType, onRemove, rerender }) {
  const row = domEl('div', 'var-row');
  if (withKey) {
    const keyInput = domEl('input', 'input');
    keyInput.placeholder = 'clave';
    keyInput.value = entry.key;
    keyInput.addEventListener('input', () => { entry.key = keyInput.value; });
    row.appendChild(keyInput);
  }
  if (!fixedType) {
    const typeSelect = domEl('select', 'select var-type');
    for (const t of BASIC_VAR_TYPES) {
      const option = domEl('option', '', t);
      option.value = t;
      typeSelect.appendChild(option);
    }
    typeSelect.value = entry.type;
    typeSelect.addEventListener('change', () => {
      entry.type = typeSelect.value;
      entry.raw = convertRaw(entry.raw, entry.type);
      rerender();
    });
    row.appendChild(typeSelect);
  }
  const type = fixedType || entry.type;
  if (type === 'boolean') {
    const sel = domEl('select', 'select');
    for (const v of ['true', 'false']) {
      const option = domEl('option', '', v);
      option.value = v;
      sel.appendChild(option);
    }
    sel.value = String(entry.raw === true);
    sel.addEventListener('change', () => { entry.raw = sel.value === 'true'; });
    row.appendChild(sel);
  } else {
    const input = domEl('input', 'input');
    input.placeholder = type;
    input.value = entry.raw;
    input.addEventListener('input', () => { entry.raw = input.value; });
    row.appendChild(input);
  }
  const remove = domEl('button', 'small-btn', '✕');
  remove.title = 'Eliminar';
  remove.addEventListener('click', onRemove);
  row.appendChild(remove);
  return row;
}

function openVariableModal(node) {
  const varType = node.config.var_type || 'string';
  const subtype = node.config.list_subtype || 'string';
  const work = loadVariableWork(node, varType, subtype);
  const m = openModal({
    title: varType === 'dict' ? 'Configurar diccionario' : `Configurar lista de ${subtype}`,
  });

  const errorBox = domEl('div', 'modal-error');
  const cancel = domEl('button', 'btn', 'Cancelar');
  cancel.addEventListener('click', m.close);
  const save = domEl('button', 'btn', 'Guardar');
  save.addEventListener('click', () => {
    const { errors, value } = serializeVariableWork(varType, subtype, work);
    if (errors.length) {
      errorBox.textContent = errors.join('\n');
      return;
    }
    node.config.op = value;
    m.close();
    updateNodeAndSave();
  });
  m.footer.appendChild(errorBox);
  m.footer.appendChild(cancel);
  m.footer.appendChild(save);

  const render = () => {
    m.body.innerHTML = '';

    const renderEntries = (container, list, withKey) => {
      if (!list.length) container.appendChild(domEl('div', 'muted', 'Sin elementos'));
      list.forEach((entry, i) => {
        container.appendChild(buildEntryRow({
          entry,
          withKey,
          onRemove: () => { list.splice(i, 1); render(); },
          rerender: render,
        }));
      });
      const add = domEl('button', 'small-btn', withKey ? 'Añadir entrada' : 'Añadir elemento');
      add.addEventListener('click', () => {
        list.push({ key: '', type: 'string', raw: '' });
        render();
      });
      container.appendChild(add);
    };

    if (varType === 'dict') {
      renderEntries(m.body, work, true);
      return;
    }

    if (BASIC_VAR_TYPES.includes(subtype)) {
      if (!work.length) m.body.appendChild(domEl('div', 'muted', 'Sin elementos'));
      work.forEach((item, i) => {
        const row = buildEntryRow({
          entry: item,
          withKey: false,
          fixedType: subtype,
          onRemove: () => { work.splice(i, 1); render(); },
          rerender: render,
        });
        row.insertBefore(domEl('span', 'var-index', `#${i}`), row.firstChild);
        m.body.appendChild(row);
      });
      const add = domEl('button', 'small-btn', 'Añadir elemento');
      add.addEventListener('click', () => {
        work.push({ raw: rawFromValue(subtype, '') });
        render();
      });
      m.body.appendChild(add);
      return;
    }

    const kind = subtype === 'dict' ? 'Diccionario' : 'Lista';
    if (!work.length) m.body.appendChild(domEl('div', 'muted', 'Sin elementos'));
    work.forEach((inner, i) => {
      const card = domEl('div', 'modal-var');
      const cardHead = domEl('div', 'modal-var-head');
      cardHead.appendChild(domEl('strong', '', `${kind} #${i}`));
      const remove = domEl('button', 'small-btn', `Eliminar ${kind.toLowerCase()}`);
      remove.addEventListener('click', () => { work.splice(i, 1); render(); });
      cardHead.appendChild(remove);
      card.appendChild(cardHead);
      renderEntries(card, inner, subtype === 'dict');
      m.body.appendChild(card);
    });
    const addInner = domEl('button', 'small-btn', `Añadir ${kind.toLowerCase()}`);
    addInner.addEventListener('click', () => {
      work.push([]);
      render();
    });
    m.body.appendChild(addInner);
  };
  render();
}

function openDebugValuesModal(node, data) {
  const m = openModal({ title: `Valores de ${nodeTitle(node)}` });
  const body = m.body;
  for (const [label, rows] of [['Entradas', data.inputs], ['Salidas', data.outputs]]) {
    const section = document.createElement('div');
    section.className = 'debug-values-section';
    section.textContent = label;
    body.appendChild(section);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'Sin valores';
      body.appendChild(empty);
      continue;
    }
    for (const row of rows) {
      const text = String(row.full ?? row.value);
      const item = document.createElement('div');
      item.className = 'modal-var';
      const itemHead = document.createElement('div');
      itemHead.className = 'modal-var-head';
      const name = document.createElement('strong');
      name.textContent = `${row.name} (${row.type})`;
      itemHead.appendChild(name);
      const pre = document.createElement('pre');
      pre.className = 'modal-var-value';
      pre.textContent = text;
      if (text.length > 300 || text.split('\n').length > 8) {
        const toggle = document.createElement('button');
        toggle.className = 'btn btn-small';
        toggle.textContent = 'Colapsar';
        toggle.addEventListener('click', () => {
          pre.hidden = !pre.hidden;
          toggle.textContent = pre.hidden ? 'Expandir' : 'Colapsar';
        });
        itemHead.appendChild(toggle);
      }
      item.appendChild(itemHead);
      item.appendChild(pre);
      body.appendChild(item);
    }
  }
}

function renderDebugValues(node, root) {
  if (!state.debug.active) return;
  const box = document.createElement('div');
  box.className = 'debug-values';
  const title = document.createElement('div');
  title.className = 'debug-values-title';
  title.textContent = 'Valores del nodo (depuración)';
  box.appendChild(title);

  const addMuted = (text) => {
    const m = document.createElement('div');
    m.className = 'muted';
    m.textContent = text;
    box.appendChild(m);
  };

  const data = state.debug.nodeValues[node.id];
  if (!data) {
    addMuted('Cargando…');
    loadDebugNodeValues(node.id);
  } else if (data.error) {
    addMuted(data.error);
  } else {
    if (!data.executed) addMuted('Este nodo aún no se ha ejecutado.');
    if (data.inputs.length || data.outputs.length) {
      const actions = document.createElement('div');
      actions.className = 'debug-values-actions';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-small';
      copyBtn.textContent = 'Copiar';
      copyBtn.addEventListener('click', () => copyDebugValues(data));
      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn btn-small';
      viewBtn.textContent = 'Ver';
      viewBtn.addEventListener('click', () => openDebugValuesModal(node, data));
      actions.appendChild(copyBtn);
      actions.appendChild(viewBtn);
      box.appendChild(actions);
    }
    for (const [label, rows] of [['Entradas', data.inputs], ['Salidas', data.outputs]]) {
      if (!data.executed && label === 'Salidas') continue;
      const head = document.createElement('div');
      head.className = 'debug-values-section';
      head.textContent = label;
      box.appendChild(head);
      if (!rows.length) {
        addMuted('Sin valores');
        continue;
      }
      for (const row of rows) {
        const line = document.createElement('div');
        line.className = 'debug-value-row';
        const name = document.createElement('strong');
        name.textContent = `${row.name} (${row.type}): `;
        const value = document.createElement('code');
        value.textContent = row.value;
        line.appendChild(name);
        line.appendChild(value);
        box.appendChild(line);
      }
    }
  }
  root.appendChild(box);
}

async function runNode(nodeId) {
  if (!state.currentProject) return;
  startExecutionTracking('Ejecutando nodo');
  try {
    const res = await api.streamExecuteNode(state.currentProject.id, nodeId, (event) => {
      if (event.type === 'step' && event.step) updateExecutionStep(event.step);
    });
    finishExecutionTracking(res, 'Nodo completado');
    if (res.console && res.console.length) appendConsole(res.console);
    if (res.notifications) res.notifications.forEach(m => toast('Alert', m, 'success'));
  } catch (e) {
    failExecutionTracking();
    const errors = e.data && e.data.errors ? e.data.errors.map(x => x.message).join('\n') : e.message;
    toast('Ejecución', errors, 'error');
  }
}

function setSelectedNodes(nodeIds) {
  state.selectedNodeIds = nodeIds.slice();
  state.selectedNodeId = nodeIds[0] || null;
  renderProject();
}

function wireKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (!state.currentProject) return;
    if (document.querySelector('.modal-backdrop')) return;
    if (document.activeElement && document.activeElement.matches('input, select, textarea')) return;
    if (el.palette.hidden === false) {
      if (e.key === 'Escape') closePalette();
      return;
    }

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    if (ctrl && e.key.toLowerCase() === 'c') {
      if (state.selectedNodeId) copyNode(state.selectedNodeId);
      e.preventDefault();
    }
    if (ctrl && e.key.toLowerCase() === 'v') {
      if (state.clipboardNode) {
        const c = JSON.parse(JSON.stringify(state.clipboardNode));
        c.id = uid('n');
        c.x = state.mouse.x;
        c.y = state.mouse.y;
        c.locked = false;
        state.currentProject.nodes.push(c);
        validateProjectLocal(state.currentProject);
        selectNode(c.id);
        renderProject();
        saveProjectDebounced();
      }
      e.preventDefault();
    }
    if (ctrl && e.key.toLowerCase() === 'd') {
      if (state.selectedNodeId) duplicateNode(state.selectedNodeId, false);
      e.preventDefault();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedNodeId) deleteNode(state.selectedNodeId);
      e.preventDefault();
    }
  });
}

function wireEditorInteractions() {
  el.editor.addEventListener('dblclick', (e) => {
    if (!state.currentProject) return;
    if (e.target.closest('.node')) return;
    state.mouse = worldPointFromClient(e.clientX, e.clientY);
    openPalette({ position: { ...state.mouse } });
  });

  el.editor.addEventListener('pointermove', (e) => {
    state.mouse = worldPointFromClient(e.clientX, e.clientY);
  });

  el.editor.addEventListener('pointerdown', (e) => {
    state.mouse = worldPointFromClient(e.clientX, e.clientY);
    if (e.button === 0 && e.ctrlKey && !isInteractiveTarget(e.target)) {
      const overlay = getSelectionOverlay();
      const start = screenPointFromClient(e.clientX, e.clientY);
      overlay.hidden = false;
      overlay.style.left = `${start.x}px`;
      overlay.style.top = `${start.y}px`;
      overlay.style.width = '0px';
      overlay.style.height = '0px';

      const onMove = (ev) => {
        const cur = screenPointFromClient(ev.clientX, ev.clientY);
        const left = Math.min(start.x, cur.x);
        const top = Math.min(start.y, cur.y);
        overlay.style.left = `${left}px`;
        overlay.style.top = `${top}px`;
        overlay.style.width = `${Math.abs(cur.x - start.x)}px`;
        overlay.style.height = `${Math.abs(cur.y - start.y)}px`;
      };
      const onUp = () => {
        const rect = overlay.getBoundingClientRect();
        overlay.hidden = true;
        const ids = Array.from(el.nodes.querySelectorAll('.node'))
          .filter((nodeEl) => {
            const box = nodeEl.getBoundingClientRect();
            return !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom);
          })
          .map((nodeEl) => nodeEl.dataset.nodeId);
        setSelectedNodes(ids);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const baseX = state.viewport.x;
      const baseY = state.viewport.y;
      el.editor.classList.add('panning');

      const onMove = (ev) => {
        state.viewport.x = Math.round(baseX + (ev.clientX - startX));
        state.viewport.y = Math.round(baseY + (ev.clientY - startY));
        updateViewportTransform();
        renderWires();
      };
      const onUp = () => {
        el.editor.classList.remove('panning');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }

    if (!e.target.closest('.node')) {
      state.selectedNodeId = null;
      state.selectedNodeIds = [];
      renderProject();
    }
  });

  el.editor.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = el.editor.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = (px - state.viewport.x) / state.zoom;
    const worldY = (py - state.viewport.y) / state.zoom;
    const nextZoom = Math.min(2.25, Math.max(0.45, state.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    state.zoom = Math.round(nextZoom * 1000) / 1000;
    state.viewport.x = Math.round(px - worldX * state.zoom);
    state.viewport.y = Math.round(py - worldY * state.zoom);
    updateViewportTransform();
    renderWires();
  }, { passive: false });

  el.editor.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  el.palette.addEventListener('pointerdown', (e) => {
    if (e.target === el.palette) closePalette();
  });

  el.paletteSearch.addEventListener('input', () => {
    renderPaletteList(el.paletteSearch.value);
  });

  el.paletteSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePalette();
  });
}

async function openAddProjectMenu() {
  openMenu(el.addProjectBtn, [
    {
      label: 'Nuevo proyecto',
      onClick: async () => {
        try {
          const p = await api.createProject();
          await refreshProjects(p.id);
        } catch (e) {
          toast('Error', e.message, 'error');
        }
      },
    },
    {
      label: 'Importar JSON',
      onClick: async () => {
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/json,.json';
          input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const txt = await file.text();
            const json = JSON.parse(txt);
            const p = await api.importProject(json);
            await refreshProjects(p.id);
            toast('Importar', 'Proyecto importado', 'success');
          }, { once: true });
          input.click();
        } catch (e) {
          toast('Error', e.message, 'error');
        }
      },
    },
  ]);
}

async function init() {
  setTheme(getTheme());

  state.nodeTypes = await api.getNodeTypes();
  state.nodeTypesByType = Object.fromEntries(state.nodeTypes.map(nt => [nt.type, nt]));

  state.projects = await api.listProjects();
  if (!state.projects.length) {
    await api.createProject();
    state.projects = await api.listProjects();
  }

  await openProject(state.projects[0].id);
  renderTabs();

  el.themeToggleBtn.addEventListener('click', () => {
    const cur = getTheme();
    setTheme(cur === 'dark' ? 'light' : 'dark');
  });

  el.addProjectBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openAddProjectMenu();
  });

  el.runProjectBtn.addEventListener('click', async () => {
    clearConsole();
    await runProject();
  });

  el.debugProjectBtn.addEventListener('click', startDebug);
  el.debugStepBtn.addEventListener('click', () => debugAction(api.debugStep));
  el.debugRepeatBtn.addEventListener('click', () => debugAction(api.debugRepeat));
  el.debugStopBtn.addEventListener('click', stopDebug);

  wireEditorInteractions();
  wireKeyboardShortcuts();

  window.addEventListener('resize', renderWires);

//   toast('Listo', 'Doble click en el editor para añadir nodos', 'success');
}

init().catch((e) => {
  toast('Error', e.message || String(e), 'error');
});
