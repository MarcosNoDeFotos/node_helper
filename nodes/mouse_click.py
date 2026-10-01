from __future__ import annotations

from typing import Any
import pyautogui
from .base import (
    BaseNode,
    ConfigField,
    ExecFire,
    NodeDef,
    NodeInstance,
    PortDef,
    ResolveContext,
    RouteType,
    ValidationError,
)


class MouseClickNode(BaseNode):
    definition = NodeDef(
        type="mouse_click",
        title="Mouse Click",
        description="Hace clic del ratón.",
        inputs=[
            PortDef("exec_in", "in", RouteType.EXEC, required=True),
            PortDef("position", "in", RouteType.VECTOR2, required=True),
        ],
        outputs=[PortDef("exec_out", "out", RouteType.EXEC, required=True),],
        config_fields=[
            ConfigField(
                key="op",
                label="Tipo de clic",
                type="select",
                default="izquierdo",
                required=True,
                options=[
                    {"label": "Izquierdo", "value": "izquierdo", "hide_inputs": ["delay"]},
                    {"label": "Doble clic izquierdo", "value": "doble_izquierdo"},
                    {"label": "Derecho", "value": "derecho", "hide_inputs": ["delay"]},
                    {"label": "Doble clic derecho", "value": "doble_derecho"},
                    {"label": "Medio", "value": "medio", "hide_inputs": ["delay"]},
                ],
            ),
            ConfigField(
                key="delay",
                label="Delay entre clics (ms)",
                type="int",
                default=100,
                required=False
            )
        ],
    )

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        if output_port != "result":
            raise ValueError("Salida desconocida")
        
        

   
    @classmethod
    def execute(
        cls,
        node: NodeInstance,
        *,
        triggered: bool,
        ctx: ResolveContext,
        fire: ExecFire,
        emit_console,
        emit_notification,
    ) -> None:
        tipo = node.config.get("op", "izquierdo")
        delay = node.config.get("delay", 100)
        position = ctx.input_value(node, cls.definition.inputs[1], default=None)
        if position is None:
            raise ValueError("Falta valor para 'position'")
        if tipo == "izquierdo":
            pyautogui.click(button="left", x=position.x, y=position.y)
        elif tipo == "doble_izquierdo":
            pyautogui.doubleClick(button="left", x=position.x, y=position.y, interval=delay/1000)
        elif tipo == "derecho":
            pyautogui.click(button="right", x=position.x, y=position.y)
        elif tipo == "doble_derecho":
            pyautogui.doubleClick(button="right", x=position.x, y=position.y, interval=delay/1000)
        elif tipo == "medio":
            pyautogui.click(button="middle", x=position.x, y=position.y)
        print(f"Clic '{tipo}' realizado en posición ({position.x}, {position.y})")
        fire.fire("exec_out")
