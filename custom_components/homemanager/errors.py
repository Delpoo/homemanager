"""Bounded, public error codes; never include imported documents or HA errors."""


class ModelError(Exception):
    """A request rejected at the server boundary."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
