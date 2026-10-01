from __future__ import annotations

from typing import Any

from .start import StartNode
from .to_string import ToStringNode

from .alert_node import AlertNode
from .base import BaseNode, node_def_to_json
from .for_loop import ForNode
from .if_else import IfElseNode
from .math_expr import MathExpressionNode
from .print_node import PrintNode
from .variable import VariableNode
from .delay import DelayNode
from .screenshot import ScreenshotNode
from .ocr_regognize import OCRRecognizeNode
from .mouse_click import MouseClickNode
from .keyboard_write import KeyboardWriteNode
def get_node_registry() -> dict[str, type[BaseNode]]:
    # Registro explícito (estructura estática y fácil de extender añadiendo nuevos imports).
    return {
        StartNode.definition.type: StartNode,
        IfElseNode.definition.type: IfElseNode,
        MathExpressionNode.definition.type: MathExpressionNode,
        PrintNode.definition.type: PrintNode,
        AlertNode.definition.type: AlertNode,
        ForNode.definition.type: ForNode,
        VariableNode.definition.type: VariableNode,
        ToStringNode.definition.type: ToStringNode,
        DelayNode.definition.type: DelayNode,
        ScreenshotNode.definition.type: ScreenshotNode,
        OCRRecognizeNode.definition.type: OCRRecognizeNode,
        MouseClickNode.definition.type: MouseClickNode,
        KeyboardWriteNode.definition.type: KeyboardWriteNode,
    }


def get_node_definitions_json() -> list[dict[str, Any]]:
    reg = get_node_registry()
    return [node_def_to_json(cls.definition) for cls in reg.values()]
