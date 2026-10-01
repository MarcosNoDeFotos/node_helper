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


class KeyboardWriteNode(BaseNode):
    definition = NodeDef(
        type="keyboard_write",
        title="Keyboard Write",
        description="Escribe con teclado",
        inputs=[
            PortDef("exec_in", "in", RouteType.EXEC, required=True),
            PortDef("text", "in", RouteType.STRING, required=True),
        ],
        outputs=[PortDef("exec_out", "out", RouteType.EXEC, required=False),],
        config_fields=[
            ConfigField(
                key="text",
                label="Texto a escribir",
                type="string",
                default="",
                required=True
            ),
            ConfigField(
                key="delay",
                label="Delay entre caracteres (ms)",
                type="int",
                default=100,
                required=True
            ),
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
        text = node.config.get("text", None)
        delay = node.config.get("delay", 100)

        if text is None:
            raise ValueError("Falta valor para 'text'")

        pyautogui.write(text, interval=delay/1000)
        
        fire.fire("exec_out")
