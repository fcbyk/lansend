"""CLI 参数校验（lansend 专用部分）。"""

import os

import click


def validate_directory(directory: str) -> str | None:
    """验证并返回绝对路径形式的共享目录。"""
    if not os.path.exists(directory):
        click.echo(f"Error: Directory {directory} does not exist")
        return None

    if not os.path.isdir(directory):
        click.echo(f"Error: {directory} is not a directory")
        return None

    return os.path.abspath(directory)
