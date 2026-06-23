"""CLI 交互函数（lansend 专用部分）。"""

from typing import Any

import click

from byksdk import copy_to_clipboard, echo_network_urls


def prompt_upload_password(ask_password: bool, disable_upload: bool) -> str | None:
    """根据命令参数决定是否提示上传密码。"""
    if ask_password and not disable_upload:
        password = click.prompt(
            "Upload password (press Enter to use default: 123456)",
            hide_input=True,
            default="123456",
            show_default=False,
        )
        return password if password else "123456"
    return None


def print_server_summary(
    shared_directory: str,
    port: int,
    networks: list[dict[str, Any]],
    upload_password_enabled: bool,
) -> str | None:
    """打印启动摘要并返回优先用于打开/复制的 URL。"""
    click.echo()
    click.echo(f" Directory: {shared_directory}")
    if upload_password_enabled:
        click.echo(" Upload Password: Enabled")

    echo_network_urls(networks, port, include_virtual=True)

    local_ip = None
    if networks:
        ips = networks[0].get("ips") or []
        if ips:
            local_ip = ips[0]

    url = f"http://{local_ip}:{port}" if local_ip else f"http://localhost:{port}"
    copy_to_clipboard(url)
    click.echo()
    return url
