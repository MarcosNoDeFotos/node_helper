from __future__ import annotations
from csv import reader

import numpy as np
from typing import Any
import PIL.Image as Image
import cv2
import easyocr

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
    Vector2
)


class OCRRecognizeNode(BaseNode):
    definition = NodeDef(
        type="ocr_recognize",
        title="OCR Recognize",
        description="Reconoce texto en una imagen y devuelve la posición x, y del texto.",
        inputs=[
            PortDef("image", "in", RouteType.IMAGE, required=True),
            PortDef("target_text", "in", RouteType.STRING, required=False),
        ],
        outputs=[PortDef("result", "out", RouteType.VECTOR2)],
        config_fields=[
            ConfigField("target_text", "Target Text", "string", required=True)
        ],
    )

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        if output_port != "result":
            raise ValueError("Salida desconocida")

        img_in = ctx.input_value(node, cls.definition.inputs[0], default=None)
        if img_in is None:
            raise ValueError("Falta imagen para 'image'")
        target_text = ctx.input_value(node, cls.definition.inputs[1], default=None)
        if target_text is None:
            target_text = node.config.get("target_text") or ""
        img_np = np.array(img_in)

        reader = easyocr.Reader(["en"], gpu=True)
        results = reader.readtext(img_np)
        for bbox, text, confidence in results:
            if target_text.lower() in text.lower():

                x = sum(p[0] for p in bbox) / 4
                y = sum(p[1] for p in bbox) / 4

                return Vector2(x, y)

        return None
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
