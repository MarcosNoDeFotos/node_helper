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


class ScreenshotNode(BaseNode):
    definition = NodeDef(
        type="screenshot",
        title="Screenshot",
        description="Hace una captura de pantalla.",
        inputs=[
            
        ],
        outputs=[PortDef("result", "out", RouteType.IMAGE)],
        config_fields=[
            
        ],
    )

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        if output_port != "result":
            raise ValueError("Salida desconocida")

        img = pyautogui.screenshot()

        return img

   
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
        # Nodo sin ruta de ejecución: no se ejecuta en modo 'exec'.
        return
