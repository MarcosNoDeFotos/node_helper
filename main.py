from __future__ import annotations

import copy
import json
import queue
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Dict, List, Optional, Tuple

from flask import Flask, Response, jsonify, make_response, render_template, request, stream_with_context

from nodes.registry import get_node_definitions_json, get_node_registry
from nodes.base import Edge, ExecutionResult, ExecutionStep, NodeInstance, RouteType, ValidationError
from nodes.base import ExecFire, ResolveContext


app = Flask(__name__)
DATA_DIR = Path(__file__).resolve().parent / "data"
PROJECTS_FILE = DATA_DIR / "projects.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


# ----------------------------
# Almacenamiento (memoria)
# ----------------------------


PROJECTS: Dict[str, dict[str, Any]] = {}


def _make_start_node() -> dict[str, Any]:
    return {
        "id": "start",
        "type": "start",
        "x": 80,
        "y": 120,
        "width": 220,
        "height": 96,
        "config": {},
        "locked": True,
    }


def _hidden_input_names_for_node(node: Any, defn: Any | None = None) -> set[str]:
    node_type = node.type if hasattr(node, "type") else str((node or {}).get("type") or "")
    if defn is None:
        cls = NODE_REGISTRY.get(node_type)
        if not cls:
            return set()
        defn = cls.definition

    config = node.config if hasattr(node, "config") else ((node or {}).get("config") or {})
    hidden: set[str] = set()
    for field in defn.config_fields:
        if field.type != "select":
            continue
        current_value = config.get(field.key, field.default)
        option = next((opt for opt in field.options if opt.get("value") == current_value), None)
        for input_name in (option or {}).get("hide_inputs") or []:
            hidden.add(str(input_name))
    return hidden


def _dynamic_output_type(node: Any, port_name: str) -> RouteType | None:
    """Tipo de salida impuesto por una opción de configuración ('set_outputs'), si existe."""
    if node is None:
        return None
    node_type = node.type if hasattr(node, "type") else str((node or {}).get("type") or "")
    cls = NODE_REGISTRY.get(node_type)
    if not cls:
        return None
    config = node.config if hasattr(node, "config") else ((node or {}).get("config") or {})
    for field in cls.definition.config_fields:
        if field.type != "select":
            continue
        current_value = config.get(field.key, field.default)
        option = next((opt for opt in field.options if opt.get("value") == current_value), None)
        override = ((option or {}).get("set_outputs") or {}).get(port_name)
        if override:
            return RouteType(override)
    return None


def _normalize_project(project: dict[str, Any]) -> dict[str, Any]:
    nodes = []
    found_start = None
    for raw in project.get("nodes") or []:
        if not isinstance(raw, dict):
            continue
        node = copy.deepcopy(raw)
        if str(node.get("type")) == "start":
            if found_start is None:
                node["id"] = "start"
                node["locked"] = True
                node.setdefault("x", 80)
                node.setdefault("y", 120)
                node.setdefault("width", 220)
                node.setdefault("height", 96)
                node.setdefault("config", {})
                found_start = node
                nodes.append(node)
            continue
        node.setdefault("config", {})
        nodes.append(node)

    if found_start is None:
        nodes.insert(0, _make_start_node())

    for node in nodes:
        hidden_inputs = _hidden_input_names_for_node(node)
        config = node.setdefault("config", {})
        for input_name in hidden_inputs:
            config.pop(input_name, None)
            config.pop(f"{input_name}__type", None)

    project["nodes"] = nodes

    valid_ids = {str(n.get("id")) for n in nodes if n.get("id") is not None}
    nodes_by_id = {str(n.get("id")): n for n in nodes if n.get("id") is not None}
    edges = []
    for raw in project.get("edges") or []:
        if not isinstance(raw, dict):
            continue
        frm = raw.get("from") or {}
        to = raw.get("to") or {}
        if str(frm.get("nodeId")) not in valid_ids or str(to.get("nodeId")) not in valid_ids:
            continue
        if str(to.get("nodeId")) == "start":
            continue
        target_node = nodes_by_id.get(str(to.get("nodeId")))
        if target_node is not None and str(to.get("port")) in _hidden_input_names_for_node(target_node):
            continue
        edge = copy.deepcopy(raw)
        dynamic_type = _dynamic_output_type(nodes_by_id.get(str(frm.get("nodeId"))), str(frm.get("port")))
        if dynamic_type is not None:
            target_cls = NODE_REGISTRY.get(str(target_node.get("type"))) if target_node is not None else None
            in_port = next(
                (p for p in target_cls.definition.inputs if p.name == str(to.get("port"))),
                None,
            ) if target_cls else None
            if in_port is not None and in_port.type not in (RouteType.ANY, dynamic_type):
                continue
            edge["type"] = dynamic_type.value
        edges.append(edge)
    project["edges"] = edges
    return project


def _save_projects() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = list(PROJECTS.values())
    PROJECTS_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_projects() -> None:
    PROJECTS.clear()
    if not PROJECTS_FILE.exists():
        return
    try:
        payload = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return
    if not isinstance(payload, list):
        return
    for raw in payload:
        if not isinstance(raw, dict):
            continue
        proj = _new_project(name=raw.get("name") or None, payload=raw)
        proj["id"] = str(raw.get("id") or proj["id"])
        proj["createdAt"] = str(raw.get("createdAt") or proj["createdAt"])
        proj["updatedAt"] = str(raw.get("updatedAt") or proj["updatedAt"])
        _normalize_project(proj)
        PROJECTS[proj["id"]] = proj


def _default_project_name() -> str:
    base = "Proyecto"
    used = {p.get("name") for p in PROJECTS.values()}
    i = 1
    while f"{base} {i}" in used:
        i += 1
    return f"{base} {i}"


def _new_project(*, name: Optional[str] = None, payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    proj = {
        "id": _new_id("p"),
        "name": name or _default_project_name(),
        "nodes": [_make_start_node()],
        "edges": [],
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
    }
    if payload:
        if isinstance(payload.get("name"), str) and payload.get("name").strip():
            proj["name"] = payload["name"].strip()
        if isinstance(payload.get("nodes"), list):
            proj["nodes"] = payload["nodes"]
        if isinstance(payload.get("edges"), list):
            proj["edges"] = payload["edges"]
    _normalize_project(proj)
    return proj


def _project_summary(p: dict[str, Any]) -> dict[str, Any]:
    return {"id": p["id"], "name": p.get("name") or "Proyecto"}


def _ensure_seed() -> None:
    if PROJECTS:
        return
    _load_projects()
    if PROJECTS:
        return
    p = _new_project(name="Proyecto 1")
    PROJECTS[p["id"]] = p
    _save_projects()


# ----------------------------
# Grafo / motor
# ----------------------------


NODE_REGISTRY = get_node_registry()


class Graph:
    def __init__(self, project: dict[str, Any]):
        self.project = project
        self.nodes: dict[str, NodeInstance] = {}
        self.edges: list[Edge] = []
        self.incoming: dict[tuple[str, str], Edge] = {}
        self.outgoing: dict[tuple[str, str], list[Edge]] = {}
        self._output_cache: dict[tuple[str, str], Any] = {}

        self._load()

    def _load(self) -> None:
        for raw in self.project.get("nodes") or []:
            nid = str(raw.get("id"))
            if not nid:
                continue
            self.nodes[nid] = NodeInstance(
                id=nid,
                type=str(raw.get("type")),
                x=float(raw.get("x", 120)),
                y=float(raw.get("y", 120)),
                config=dict(raw.get("config") or {}),
            )

        for raw in self.project.get("edges") or []:
            try:
                rt = RouteType(str(raw.get("type")))
            except Exception:
                # Se valida en validate_project; aquí evitamos explotar el parser.
                continue

            ed = Edge(
                id=str(raw.get("id")),
                from_node=str((raw.get("from") or {}).get("nodeId")),
                from_port=str((raw.get("from") or {}).get("port")),
                to_node=str((raw.get("to") or {}).get("nodeId")),
                to_port=str((raw.get("to") or {}).get("port")),
                type=rt,
            )
            self.edges.append(ed)

        for ed in self.edges:
            self.outgoing.setdefault((ed.from_node, ed.from_port), []).append(ed)
            key = (ed.to_node, ed.to_port)
            if key not in self.incoming:
                self.incoming[key] = ed

    def get_node(self, node_id: str) -> NodeInstance:
        return self.nodes[node_id]

    def get_incoming_edge(self, node_id: str, port_name: str) -> Edge | None:
        return self.incoming.get((node_id, port_name))

    def get_def(self, node_type: str):
        cls = NODE_REGISTRY.get(node_type)
        if not cls:
            raise KeyError(f"Tipo de nodo no soportado: {node_type}")
        return cls.definition

    def evaluate_output(self, node_id: str, output_port: str) -> Any:
        key = (node_id, output_port)
        if key in self._output_cache:
            return self._output_cache[key]

        node = self.nodes[node_id]
        cls = NODE_REGISTRY.get(node.type)
        if not cls:
            raise ValueError(f"Tipo de nodo desconocido: {node.type}")

        ctx = ResolveContext(
            get_incoming_edge=self.get_incoming_edge,
            get_node=self.get_node,
            evaluate_output=self.evaluate_output,
        )
        values = cls.evaluate_outputs(node, ctx=ctx)
        if values is not None:
            if output_port not in values:
                raise ValueError(f"Salida desconocida: {output_port}")
            for port_name, port_value in values.items():
                self._output_cache[(node_id, port_name)] = port_value
            return values[output_port]

        val = cls.evaluate_output(node, output_port, ctx=ctx)
        self._output_cache[key] = val
        return val


def validate_project(project: dict[str, Any]) -> list[ValidationError]:
    errors: list[ValidationError] = []
    g = Graph(project)

    # IDs duplicados
    ids = [n.get("id") for n in (project.get("nodes") or [])]
    ids = [str(x) for x in ids if x is not None]
    if len(ids) != len(set(ids)):
        errors.append(ValidationError(node_id=None, message="Hay IDs de nodo duplicados."))

    # Validar nodos
    for nid, node in g.nodes.items():
        if node.type not in NODE_REGISTRY:
            errors.append(ValidationError(node_id=nid, message=f"Tipo de nodo desconocido: {node.type}"))

    start_nodes = [n for n in g.nodes.values() if n.type == "start"]
    if len(start_nodes) != 1:
        errors.append(ValidationError(node_id=None, message="Debe existir exactamente un nodo Start."))
    elif start_nodes[0].id != "start":
        errors.append(ValidationError(node_id=start_nodes[0].id, message="El nodo Start debe conservar el id 'start'."))

    # Validar edges
    for raw in project.get("edges") or []:
        # Detectar tipos inválidos (que Graph saltó)
        try:
            RouteType(str(raw.get("type")))
        except Exception:
            errors.append(ValidationError(node_id=None, message=f"Tipo de ruta inválido: {raw.get('type')}"))

    for ed in g.edges:
        if ed.from_node not in g.nodes:
            errors.append(ValidationError(node_id=None, message=f"Ruta con origen inválido: {ed.from_node}"))
            continue
        if ed.to_node not in g.nodes:
            errors.append(ValidationError(node_id=None, message=f"Ruta con destino inválido: {ed.to_node}"))
            continue

        from_node = g.nodes[ed.from_node]
        to_node = g.nodes[ed.to_node]
        if from_node.type not in NODE_REGISTRY or to_node.type not in NODE_REGISTRY:
            continue

        from_def = NODE_REGISTRY[from_node.type].definition
        to_def = NODE_REGISTRY[to_node.type].definition
        hidden_inputs = _hidden_input_names_for_node(to_node, to_def)
        if ed.to_port in hidden_inputs:
            continue

        out_port = next((p for p in from_def.outputs if p.name == ed.from_port), None)
        in_port = next((p for p in to_def.inputs if p.name == ed.to_port), None)
        if not out_port:
            errors.append(ValidationError(node_id=from_node.id, message=f"Salida inexistente: {ed.from_port}"))
            continue
        if not in_port:
            errors.append(ValidationError(node_id=to_node.id, message=f"Entrada inexistente: {ed.to_port}"))
            continue

        if to_node.type == "start":
            errors.append(ValidationError(node_id=to_node.id, message="El nodo Start no admite entradas."))
            continue

        out_type = _dynamic_output_type(from_node, ed.from_port) or out_port.type
        if out_type != ed.type:
            errors.append(
                ValidationError(
                    node_id=from_node.id,
                    message=(
                        f"La ruta '{ed.from_port}' declara tipo {ed.type.value} pero la salida es {out_type.value}."
                    ),
                )
            )

        if in_port.type != RouteType.ANY and in_port.type != ed.type:
            errors.append(
                ValidationError(
                    node_id=to_node.id,
                    message=(
                        f"Tipo incompatible en '{ed.to_port}': espera {in_port.type.value} y recibe {ed.type.value}."
                    ),
                )
            )

    # Validar entradas requeridas no-exec + validaciones específicas
    for nid, node in g.nodes.items():
        cls = NODE_REGISTRY.get(node.type)
        if not cls:
            continue
        defn = cls.definition
        hidden_inputs = _hidden_input_names_for_node(node, defn)

        for p in defn.inputs:
            if p.name in hidden_inputs:
                continue
            if not p.required:
                continue
            if p.type == RouteType.EXEC:
                continue
            has_edge = g.get_incoming_edge(nid, p.name) is not None
            has_cfg = p.name in node.config and node.config.get(p.name) is not None
            if not has_edge and not has_cfg:
                errors.append(ValidationError(node_id=nid, message=f"Falta valor requerido en '{p.name}'"))

        errors.extend(cls.validate_instance(node, get_incoming_edge=g.get_incoming_edge, get_def=g.get_def))

    return errors


def _estimate_project_steps(g: Graph) -> int:
    def has_incoming_exec(nid: str) -> bool:
        node = g.nodes[nid]
        defn = NODE_REGISTRY[node.type].definition
        for p in defn.inputs:
            if p.type != RouteType.EXEC:
                continue
            ed = g.get_incoming_edge(nid, p.name)
            if ed is not None and ed.type == RouteType.EXEC:
                return True
        return False

    queue: list[str] = []
    seen: set[str] = set()
    for nid, node in g.nodes.items():
        if node.type not in NODE_REGISTRY:
            continue
        defn = NODE_REGISTRY[node.type].definition
        if node.type == "start":
            queue.append(nid)
            continue
        if not any(p.type == RouteType.EXEC for p in defn.inputs):
            continue
        if node.type == "if_else" and (node.config.get("mode") or "constant").lower() == "constant":
            queue.append(nid)
            continue
        if not has_incoming_exec(nid):
            queue.append(nid)

    while queue:
        current = queue.pop(0)
        if current in seen or current not in g.nodes:
            continue
        seen.add(current)
        for (from_node, _out_port), edges in g.outgoing.items():
            if from_node != current:
                continue
            for ed in edges:
                if ed.type == RouteType.EXEC and ed.to_node not in seen:
                    queue.append(ed.to_node)

    return max(len(seen), 1)


def _estimate_upstream_steps(g: Graph, upstream: set[str], target_node_id: str) -> int:
    return max(len(upstream), 1 if target_node_id in g.nodes else 0)


def _serialize_execution_step(step: ExecutionStep) -> dict[str, Any]:
    return {
        "nodeId": step.node_id,
        "elapsedMs": step.elapsed_ms,
        "completedSteps": step.completed_steps,
        "totalSteps": step.total_steps,
    }


def _stream_ndjson(event: dict[str, Any]) -> str:
    return json.dumps(event, ensure_ascii=False) + "\n"


def _stream_execution(
    run_execution: Callable[[Callable[[ExecutionStep], None]], tuple[ExecutionResult, list[ValidationError]]],
) -> Response:
    events: queue.Queue[dict[str, Any] | object] = queue.Queue()
    sentinel = object()

    def on_step(step: ExecutionStep) -> None:
        events.put({"type": "step", "step": _serialize_execution_step(step)})

    def worker() -> None:
        try:
            result, errors = run_execution(on_step)
            if errors:
                events.put({
                    "type": "error",
                    "error": "No se puede ejecutar",
                    "errors": [asdict(err) for err in errors],
                })
            else:
                events.put({"type": "done", "result": asdict(result)})
        except Exception as ex:  # noqa: BLE001
            events.put({
                "type": "error",
                "error": str(ex),
                "errors": [{"node_id": None, "message": str(ex)}],
            })
        finally:
            events.put(sentinel)

    threading.Thread(target=worker, daemon=True).start()

    @stream_with_context
    def generate():
        while True:
            item = events.get()
            if item is sentinel:
                break
            yield _stream_ndjson(item)

    return Response(
        generate(),
        mimetype="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def execute_project(
    project: dict[str, Any],
    *,
    on_step: Callable[[ExecutionStep], None] | None = None,
) -> tuple[ExecutionResult, list[ValidationError]]:
    errors = validate_project(project)
    if errors:
        return ExecutionResult(), errors

    g = Graph(project)
    ctx = ResolveContext(
        get_incoming_edge=g.get_incoming_edge,
        get_node=g.get_node,
        evaluate_output=g.evaluate_output,
    )

    result = ExecutionResult()
    started_at = perf_counter()
    result.total_steps = _estimate_project_steps(g)

    def emit_console(msg: str) -> None:
        result.console.append(msg)

    def emit_notification(msg: str) -> None:
        result.notifications.append(msg)

    def has_incoming_exec(nid: str) -> bool:
        node = g.nodes[nid]
        defn = NODE_REGISTRY[node.type].definition
        for p in defn.inputs:
            if p.type != RouteType.EXEC:
                continue
            ed = g.get_incoming_edge(nid, p.name)
            if ed is not None and ed.type == RouteType.EXEC:
                return True
        return False

    queue: list[tuple[str, bool]] = []
    for nid, node in g.nodes.items():
        if node.type not in NODE_REGISTRY:
            continue
        defn = NODE_REGISTRY[node.type].definition
        if node.type == "start":
            queue.append((nid, True))
            continue
        if not any(p.type == RouteType.EXEC for p in defn.inputs):
            continue

        has_incoming = has_incoming_exec(nid)

        # if-else modo Constante sin entrada exec conectada
        if node.type == "if_else" and (node.config.get("mode") or "constant").lower() == "constant" and not has_incoming:
            queue.append((nid, False))
            continue

        if not has_incoming:
            queue.append((nid, True))

    max_steps = 5000
    steps = 0
    while queue:
        steps += 1
        if steps > max_steps:
            return ExecutionResult(), [
                ValidationError(node_id=None, message="Ejecución detenida: demasiados pasos (posible ciclo infinito).")
            ]

        node_id, triggered = queue.pop(0)
        if node_id not in g.nodes:
            continue
        node = g.nodes[node_id]
        cls = NODE_REGISTRY.get(node.type)
        if not cls:
            continue

        result.executed_order.append(node_id)
        step = ExecutionStep(
            node_id=node_id,
            elapsed_ms=max(0, int((perf_counter() - started_at) * 1000)),
            completed_steps=len(result.executed_order),
            total_steps=result.total_steps,
        )
        result.steps.append(step)
        if on_step is not None:
            on_step(step)
        fire = ExecFire()
        try:
            cls.execute(
                node,
                triggered=triggered,
                ctx=ctx,
                fire=fire,
                emit_console=emit_console,
                emit_notification=emit_notification,
            )
        except Exception as ex:  # noqa: BLE001
            return ExecutionResult(), [ValidationError(node_id=node_id, message=str(ex))]

        for out_port in fire.fired_ports:
            for ed in g.outgoing.get((node_id, out_port), []):
                if ed.type != RouteType.EXEC:
                    continue
                queue.append((ed.to_node, True))

    result.duration_ms = max(0, int((perf_counter() - started_at) * 1000))
    result.total_steps = max(result.total_steps, len(result.executed_order), 1)
    for step in result.steps:
        step.total_steps = result.total_steps
    return result, []


def execute_node_upstream(
    project: dict[str, Any],
    target_node_id: str,
    *,
    on_step: Callable[[ExecutionStep], None] | None = None,
) -> tuple[ExecutionResult, list[ValidationError]]:
    if not target_node_id:
        return ExecutionResult(), [ValidationError(node_id=None, message="nodeId es obligatorio")]

    g = Graph(project)
    if target_node_id not in g.nodes:
        return ExecutionResult(), [ValidationError(node_id=None, message="Nodo no encontrado")]

    all_errors = validate_project(project)

    # Dependencias upstream (cualquier ruta entrante)
    upstream: set[str] = set()
    stack = [target_node_id]
    while stack:
        cur = stack.pop()
        if cur in upstream:
            continue
        upstream.add(cur)
        for ed in g.edges:
            if ed.to_node == cur:
                stack.append(ed.from_node)

    # Bloquea si hay errores en upstream
    blocking = [e for e in all_errors if e.node_id in upstream or e.node_id is None]
    if blocking:
        return ExecutionResult(), blocking

    ctx = ResolveContext(
        get_incoming_edge=g.get_incoming_edge,
        get_node=g.get_node,
        evaluate_output=g.evaluate_output,
    )

    result = ExecutionResult()
    started_at = perf_counter()

    def emit_console(msg: str) -> None:
        result.console.append(msg)

    def emit_notification(msg: str) -> None:
        result.notifications.append(msg)

    def has_incoming_exec_inside(nid: str) -> bool:
        node = g.nodes[nid]
        cls = NODE_REGISTRY.get(node.type)
        if not cls:
            return False
        defn = cls.definition
        for p in defn.inputs:
            if p.type != RouteType.EXEC:
                continue
            ed = g.get_incoming_edge(nid, p.name)
            if ed is not None and ed.type == RouteType.EXEC and ed.from_node in upstream:
                return True
        return False

    # Entradas dentro del subgrafo upstream
    queue: list[tuple[str, bool]] = []
    for nid in upstream:
        node = g.nodes.get(nid)
        if not node:
            continue
        cls = NODE_REGISTRY.get(node.type)
        if not cls:
            continue
        defn = cls.definition
        if node.type == "start":
            queue.append((nid, True))
            continue
        if not any(p.type == RouteType.EXEC for p in defn.inputs):
            continue

        has_incoming = has_incoming_exec_inside(nid)

        # if-else modo Constante solo se auto-dispara si no tiene entrada exec en el subgrafo
        if node.type == "if_else" and (node.config.get("mode") or "constant").lower() == "constant" and not has_incoming:
            queue.append((nid, False))
            continue

        if not has_incoming:
            queue.append((nid, True))

    result.total_steps = _estimate_upstream_steps(g, upstream, target_node_id)
    executed_set: set[str] = set()
    max_steps = 3000
    steps = 0
    while queue:
        steps += 1
        if steps > max_steps:
            return ExecutionResult(), [
                ValidationError(node_id=None, message="Ejecución detenida: demasiados pasos (posible ciclo infinito).")
            ]

        node_id, triggered = queue.pop(0)
        if node_id not in upstream:
            continue
        if node_id not in g.nodes:
            continue

        node = g.nodes[node_id]
        cls = NODE_REGISTRY.get(node.type)
        if not cls:
            continue

        executed_set.add(node_id)
        result.executed_order.append(node_id)
        step = ExecutionStep(
            node_id=node_id,
            elapsed_ms=max(0, int((perf_counter() - started_at) * 1000)),
            completed_steps=len(result.executed_order),
            total_steps=result.total_steps,
        )
        result.steps.append(step)
        if on_step is not None:
            on_step(step)
        fire = ExecFire()
        try:
            cls.execute(
                node,
                triggered=triggered,
                ctx=ctx,
                fire=fire,
                emit_console=emit_console,
                emit_notification=emit_notification,
            )
        except Exception as ex:  # noqa: BLE001
            return ExecutionResult(), [ValidationError(node_id=node_id, message=str(ex))]

        # Nos detenemos cuando llegamos al objetivo
        if node_id == target_node_id:
            break

        for out_port in fire.fired_ports:
            for ed in g.outgoing.get((node_id, out_port), []):
                if ed.type != RouteType.EXEC:
                    continue
                if ed.to_node not in upstream:
                    continue
                queue.append((ed.to_node, True))

    # Si el objetivo no se disparó vía rutas exec, ejecútalo manualmente.
    if target_node_id not in executed_set:
        node = g.nodes[target_node_id]
        cls = NODE_REGISTRY.get(node.type)
        if not cls:
            return ExecutionResult(), [ValidationError(node_id=target_node_id, message="Tipo de nodo desconocido")]

        result.executed_order.append(target_node_id)
        step = ExecutionStep(
            node_id=target_node_id,
            elapsed_ms=max(0, int((perf_counter() - started_at) * 1000)),
            completed_steps=len(result.executed_order),
            total_steps=result.total_steps,
        )
        result.steps.append(step)
        if on_step is not None:
            on_step(step)
        try:
            cls.execute(
                node,
                triggered=True,
                ctx=ctx,
                fire=ExecFire(),
                emit_console=emit_console,
                emit_notification=emit_notification,
            )
        except Exception as ex:  # noqa: BLE001
            return ExecutionResult(), [ValidationError(node_id=target_node_id, message=str(ex))]

    result.duration_ms = max(0, int((perf_counter() - started_at) * 1000))
    result.total_steps = max(result.total_steps, len(result.executed_order), 1)
    for step in result.steps:
        step.total_steps = result.total_steps
    return result, []


# ----------------------------
# Web
# ----------------------------


@app.get("/")
def home():
    _ensure_seed()
    return render_template("index.html")


# ----------------------------
# API
# ----------------------------


@app.get("/api/node_types")
def api_node_types():
    return jsonify(get_node_definitions_json())


@app.get("/api/projects")
def api_projects_list():
    _ensure_seed()
    return jsonify([_project_summary(p) for p in PROJECTS.values()])


@app.post("/api/projects")
def api_projects_create():
    _ensure_seed()
    p = _new_project()
    PROJECTS[p["id"]] = p
    _save_projects()
    return jsonify(_project_summary(p))


@app.post("/api/projects/import")
def api_projects_import():
    _ensure_seed()
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "JSON inválido"}), 400
    p = _new_project(name=payload.get("name") or "Proyecto importado", payload=payload)
    PROJECTS[p["id"]] = p
    _save_projects()
    return jsonify(_project_summary(p))


@app.get("/api/projects/<project_id>")
def api_projects_get(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    return jsonify(p)


@app.put("/api/projects/<project_id>")
def api_projects_put(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "JSON inválido"}), 400

    p["name"] = str(payload.get("name") or p.get("name") or "Proyecto")
    p["nodes"] = payload.get("nodes") or []
    p["edges"] = payload.get("edges") or []
    p["updatedAt"] = _now_iso()
    _normalize_project(p)

    # Guardado: siempre 200, aunque haya errores (la UI los muestra y bloquea la ejecución)
    errors = validate_project(p)
    _save_projects()
    return jsonify({"ok": True, "errors": [asdict(e) for e in errors]})


@app.post("/api/projects/<project_id>/duplicate")
def api_projects_duplicate(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    clone = copy.deepcopy(p)
    clone["id"] = _new_id("p")
    clone["name"] = f"{p.get('name') or 'Proyecto'} (copia)"
    clone["createdAt"] = _now_iso()
    clone["updatedAt"] = _now_iso()

    # regenerar ids de nodos/edges para evitar colisiones
    node_id_map: dict[str, str] = {}
    for n in clone.get("nodes") or []:
        old = str(n.get("id"))
        new = _new_id("n")
        node_id_map[old] = new
        n["id"] = new
        n["x"] = float(n.get("x", 0)) + 20
        n["y"] = float(n.get("y", 0)) + 20
    for e in clone.get("edges") or []:
        e["id"] = _new_id("e")
        if "from" in e and "nodeId" in (e["from"] or {}):
            e["from"]["nodeId"] = node_id_map.get(str(e["from"]["nodeId"]), e["from"]["nodeId"])
        if "to" in e and "nodeId" in (e["to"] or {}):
            e["to"]["nodeId"] = node_id_map.get(str(e["to"]["nodeId"]), e["to"]["nodeId"])

    PROJECTS[clone["id"]] = clone
    _normalize_project(clone)
    _save_projects()
    return jsonify(_project_summary(clone))


@app.delete("/api/projects/<project_id>")
def api_projects_delete(project_id: str):
    _ensure_seed()
    if project_id not in PROJECTS:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    PROJECTS.pop(project_id)
    if not PROJECTS:
        _ensure_seed()
    _save_projects()
    return jsonify({"ok": True})


@app.get("/api/projects/<project_id>/export")
def api_projects_export(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    payload = json.dumps(p, ensure_ascii=False, indent=2).encode("utf-8")
    resp = make_response(payload)
    resp.headers["Content-Type"] = "application/json; charset=utf-8"
    resp.headers["Content-Disposition"] = f"attachment; filename=project_{project_id}.json"
    return resp


@app.post("/api/projects/<project_id>/execute")
def api_projects_execute(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    res, errors = execute_project(p)
    if errors:
        return jsonify({"error": "No se puede ejecutar", "errors": [asdict(e) for e in errors]}), 400
    return jsonify(asdict(res))


@app.post("/api/projects/<project_id>/execute/stream")
def api_projects_execute_stream(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    return _stream_execution(lambda on_step: execute_project(p, on_step=on_step))


@app.post("/api/projects/<project_id>/execute_node")
def api_projects_execute_node(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "JSON inválido"}), 400
    node_id = str(payload.get("nodeId") or "")
    res, errors = execute_node_upstream(p, node_id)
    if errors:
        return jsonify({"error": "No se puede ejecutar", "errors": [asdict(e) for e in errors]}), 400
    return jsonify(asdict(res))


@app.post("/api/projects/<project_id>/execute_node/stream")
def api_projects_execute_node_stream(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "JSON inválido"}), 400
    node_id = str(payload.get("nodeId") or "")
    return _stream_execution(lambda on_step: execute_node_upstream(p, node_id, on_step=on_step))


# ----------------------------
# Depuración (nodo a nodo)
# ----------------------------


class DebugStepError(Exception):
    def __init__(self, node_id: str, message: str) -> None:
        super().__init__(message)
        self.node_id = node_id


def _debug_value(value: Any) -> dict[str, Any]:
    if isinstance(value, (bytes, bytearray)):
        text = full = f"<{len(value)} bytes>"
    else:
        text = repr(value)
        full = value if isinstance(value, str) else text
    if len(text) > 500:
        text = text[:500] + "…"
    if len(full) > 1_000_000:
        full = full[:1_000_000] + "… (truncado)"
    return {"type": type(value).__name__, "value": text, "full": full}


class DebugSession:
    MAX_STEPS = 5000

    def __init__(self, project: dict[str, Any]) -> None:
        self.graph = Graph(project)
        self.ctx = ResolveContext(
            get_incoming_edge=self.graph.get_incoming_edge,
            get_node=self.graph.get_node,
            evaluate_output=self.graph.evaluate_output,
        )
        self.queue: list[tuple[str, bool]] = self._initial_queue()
        self.history: list[dict[str, Any]] = []
        self.executed: list[str] = []
        self.console: list[str] = []
        self.notifications: list[str] = []
        self.new_notifications: list[str] = []
        self.lock = threading.Lock()

    def _initial_queue(self) -> list[tuple[str, bool]]:
        g = self.graph
        queue: list[tuple[str, bool]] = []
        for nid, node in g.nodes.items():
            cls = NODE_REGISTRY.get(node.type)
            if not cls:
                continue
            if node.type == "start":
                queue.append((nid, True))
                continue
            exec_inputs = [p for p in cls.definition.inputs if p.type == RouteType.EXEC]
            if not exec_inputs:
                continue
            has_incoming = any(
                (ed := g.get_incoming_edge(nid, p.name)) is not None and ed.type == RouteType.EXEC
                for p in exec_inputs
            )
            if node.type == "if_else" and (node.config.get("mode") or "constant").lower() == "constant" and not has_incoming:
                queue.append((nid, False))
            elif not has_incoming:
                queue.append((nid, True))
        return queue

    def _restore(self, snapshot: dict[str, Any]) -> None:
        self.queue = list(snapshot["queue"])
        self.graph._output_cache.clear()
        self.graph._output_cache.update(snapshot["cache"])
        del self.console[snapshot["console"]:]
        del self.notifications[snapshot["notifications"]:]
        del self.executed[snapshot["executed"]:]

    def _input_sources(self, node_id: str) -> list[str]:
        g = self.graph
        node = g.nodes[node_id]
        cls = NODE_REGISTRY.get(node.type)
        if cls is None:
            return []
        hidden = _hidden_input_names_for_node(node, cls.definition)
        sources = []
        for p in cls.definition.inputs:
            if p.type == RouteType.EXEC or p.name in hidden:
                continue
            edge = g.get_incoming_edge(node_id, p.name)
            if edge is not None and edge.from_node in g.nodes:
                sources.append(edge.from_node)
        return sources

    def _next_target(self) -> tuple[str, bool] | None:
        """Nodo al que apunta el depurador: primero las entradas sin evaluar (más profundas antes), luego el nodo en cola."""
        if not self.queue:
            return None
        head = self.queue[0][0]
        done = set(self.executed)
        visited: set[str] = set()

        def visit(nid: str) -> str | None:
            if nid in done or nid in visited:
                return None
            visited.add(nid)
            for src in self._input_sources(nid):
                found = visit(src)
                if found is not None:
                    return found
            return nid

        for src in self._input_sources(head):
            found = visit(src)
            if found is not None:
                return found, True
        return head, False

    def _invalidate(self, node_id: str) -> None:
        """Descarta la caché del nodo y de toda su cadena de datos dependiente para recalcularla."""
        g = self.graph
        stale: set[str] = set()
        stack = [node_id]
        while stack:
            cur = stack.pop()
            if cur in stale:
                continue
            stale.add(cur)
            stack.extend(ed.to_node for ed in g.edges if ed.from_node == cur and ed.type != RouteType.EXEC)
        for key in [k for k in g._output_cache if k[0] in stale]:
            del g._output_cache[key]

    def step(self) -> None:
        target = self._next_target()
        if target is None:
            raise ValueError("No quedan nodos por ejecutar")
        if len(self.executed) >= self.MAX_STEPS:
            raise ValueError("Depuración detenida: demasiados pasos (posible ciclo infinito).")

        g = self.graph
        snapshot = {
            "queue": list(self.queue),
            "cache": dict(g._output_cache),
            "console": len(self.console),
            "notifications": len(self.notifications),
            "executed": len(self.executed),
        }
        self.new_notifications = []
        node_id, is_dependency = target
        node = g.nodes[node_id]
        cls = NODE_REGISTRY[node.type]
        self._invalidate(node_id)

        if is_dependency:
            try:
                for p in cls.definition.outputs:
                    if p.type != RouteType.EXEC:
                        self.ctx.output_value(node, p.name)
            except Exception as ex:  # noqa: BLE001
                self._restore(snapshot)
                raise DebugStepError(node_id, str(ex)) from ex
            self.executed.append(node_id)
            self.history.append(snapshot)
            return

        _, triggered = self.queue.pop(0)
        fire = ExecFire()
        try:
            cls.execute(
                node,
                triggered=triggered,
                ctx=self.ctx,
                fire=fire,
                emit_console=self.console.append,
                emit_notification=self.notifications.append,
            )
        except Exception as ex:  # noqa: BLE001
            self._restore(snapshot)
            raise DebugStepError(node_id, str(ex)) from ex

        self.executed.append(node_id)
        self.history.append(snapshot)
        self.new_notifications = self.notifications[snapshot["notifications"]:]
        for out_port in fire.fired_ports:
            for ed in g.outgoing.get((node_id, out_port), []):
                if ed.type == RouteType.EXEC:
                    self.queue.append((ed.to_node, True))

    def repeat(self) -> None:
        if not self.history:
            raise ValueError("No hay un nodo anterior que repetir")
        self._restore(self.history.pop())
        self.step()

    def state(self) -> dict[str, Any]:
        target = self._next_target()
        return {
            "active": True,
            "finished": target is None,
            "nextNodeId": target[0] if target else None,
            "nextIsInput": bool(target and target[1]),
            "lastNodeId": self.executed[-1] if self.executed else None,
            "executedNodeIds": list(dict.fromkeys(self.executed)),
            "stepCount": len(self.executed),
            "canRepeat": bool(self.history),
            "console": self.console,
            "newNotifications": self.new_notifications,
        }

    def _pending_dependency(self, node: NodeInstance, port: str) -> str | None:
        """Primer nodo de ejecución aún no ejecutado en la cadena que alimenta una entrada."""
        g = self.graph
        edge = g.get_incoming_edge(node.id, port)
        if edge is None:
            return None
        seen: set[str] = set()
        stack = [edge.from_node]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            src = g.nodes.get(cur)
            cls = NODE_REGISTRY.get(src.type) if src else None
            if cls is None:
                continue
            defn = cls.definition
            if cur not in self.executed and any(p.type == RouteType.EXEC for p in [*defn.inputs, *defn.outputs]):
                return cur
            stack.extend(ed.from_node for ed in g.edges if ed.to_node == cur and ed.type != RouteType.EXEC)
        return None

    def _collect(self, node: NodeInstance, *, evaluate_outputs: bool) -> dict[str, Any]:
        defn = NODE_REGISTRY[node.type].definition
        hidden = _hidden_input_names_for_node(node, defn)
        executed = node.id in self.executed
        blocked_by: str | None = None
        inputs = []
        for p in defn.inputs:
            if p.type == RouteType.EXEC or p.name in hidden:
                continue
            try:
                pending = None if executed else self._pending_dependency(node, p.name)
                if pending is not None:
                    blocked_by = blocked_by or pending
                    item = {"type": "pendiente", "value": f"depende de '{pending}', que aún no se ha ejecutado"}
                else:
                    item = _debug_value(self.ctx.input_value(node, p, default=None))
            except Exception as ex:  # noqa: BLE001
                item = {"type": "error", "value": str(ex)}
            inputs.append({"name": p.name, **item})

        outputs = []
        for p in defn.outputs:
            if p.type == RouteType.EXEC:
                continue
            key = (node.id, p.name)
            try:
                if evaluate_outputs and blocked_by is not None:
                    item = {"type": "pendiente", "value": f"depende de '{blocked_by}', que aún no se ha ejecutado"}
                elif evaluate_outputs:
                    item = _debug_value(self.ctx.output_value(node, p.name))
                elif key in self.graph._output_cache:
                    item = _debug_value(self.graph._output_cache[key])
                else:
                    item = {"type": "-", "value": "(no evaluado)"}
            except Exception as ex:  # noqa: BLE001
                item = {"type": "error", "value": str(ex)}
            outputs.append({"name": p.name, **item})
        return {"inputs": inputs, "outputs": outputs}

    def node_values(self, node_id: str) -> dict[str, Any]:
        node = self.graph.nodes.get(node_id)
        cls = NODE_REGISTRY.get(node.type) if node else None
        if node is None or cls is None:
            raise ValueError("Nodo no encontrado")
        if node_id in self.executed:
            pure = not any(p.type == RouteType.EXEC for p in [*cls.definition.inputs, *cls.definition.outputs])
            return {"executed": True, **self._collect(node, evaluate_outputs=pure)}

        defn = cls.definition
        if any(p.type == RouteType.EXEC for p in [*defn.inputs, *defn.outputs]):
            return {"executed": False, "inputs": self._collect(node, evaluate_outputs=False)["inputs"], "outputs": []}
        # Nodos de solo datos: se calculan bajo demanda.
        return {"executed": True, **self._collect(node, evaluate_outputs=True)}


DEBUG_SESSIONS: dict[str, DebugSession] = {}


def _debug_action(project_id: str, action: str):
    session = DEBUG_SESSIONS.get(project_id)
    if session is None:
        return jsonify({"error": "No hay una depuración activa"}), 404
    with session.lock:
        try:
            getattr(session, action)()
        except DebugStepError as ex:
            return jsonify({
                "error": str(ex),
                "errors": [{"node_id": ex.node_id, "message": str(ex)}],
                "state": session.state(),
            }), 400
        except ValueError as ex:
            return jsonify({"error": str(ex), "state": session.state()}), 400
        return jsonify(session.state())


@app.post("/api/projects/<project_id>/debug/start")
def api_debug_start(project_id: str):
    _ensure_seed()
    p = PROJECTS.get(project_id)
    if not p:
        return jsonify({"error": "Proyecto no encontrado"}), 404
    errors = validate_project(p)
    if errors:
        return jsonify({"error": "No se puede depurar", "errors": [asdict(e) for e in errors]}), 400
    session = DebugSession(p)
    DEBUG_SESSIONS[project_id] = session
    return jsonify(session.state())


@app.post("/api/projects/<project_id>/debug/step")
def api_debug_step(project_id: str):
    return _debug_action(project_id, "step")


@app.post("/api/projects/<project_id>/debug/repeat")
def api_debug_repeat(project_id: str):
    return _debug_action(project_id, "repeat")


@app.post("/api/projects/<project_id>/debug/stop")
def api_debug_stop(project_id: str):
    DEBUG_SESSIONS.pop(project_id, None)
    return jsonify({"ok": True})


@app.get("/api/projects/<project_id>/debug/node")
def api_debug_node(project_id: str):
    session = DEBUG_SESSIONS.get(project_id)
    if session is None:
        return jsonify({"error": "No hay una depuración activa"}), 404
    with session.lock:
        try:
            return jsonify(session.node_values(str(request.args.get("nodeId") or "")))
        except ValueError as ex:
            return jsonify({"error": str(ex)}), 404


_ensure_seed()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
