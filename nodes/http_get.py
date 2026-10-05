from __future__ import annotations

from typing import Any

import requests
from .base import (
    BaseNode,
    ConfigField,
    ExecFire,
    NodeDef,
    NodeInstance,
    PortDef,
    ResolveContext,
    RouteType,
)


class HttpGetNode(BaseNode):
    definition = NodeDef(
        type="http_get",
        title="Petición HTTP - GET",
        description=(
            "Realiza una petición HTTP de tipo GET a una dirección"
        ),
        inputs=[
            PortDef("exec_in", "in", RouteType.EXEC),
            PortDef("url", "in", RouteType.STRING, required=False),
        ],
        outputs=[
            PortDef("exec_out", "out", RouteType.EXEC),
            PortDef("response_code", "out", RouteType.INT),
            PortDef("response_text", "out", RouteType.STRING),
        ],
        config_fields=[
            ConfigField(
                key="url",
                label="URL (si no hay entrada)",
                type="string",
                default="",
            )
        ],
    )

    @classmethod
    def evaluate_outputs(cls, node: NodeInstance, *, ctx: ResolveContext) -> dict[str, Any]:
        url = ctx.input_value(node, cls.definition.inputs[1], default=None)
        if url is None or url == "":
            raise ValueError("Falta valor para 'url'")

        response = requests.get(str(url), timeout=30)
        return {
            "response_code": response.status_code,
            "response_text": response.text,
        }

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        raise ValueError("http_get calcula sus salidas en evaluate_outputs")

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
        ctx.output_value(node, "response_code")
        fire.fire("exec_out")
