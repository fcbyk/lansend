import threading
from dataclasses import dataclass

from byksdk import check_port, get_private_networks, open_browser, wait_for_server_ready

from lansend.bootstrap import start_web_server
from lansend.cli.ui import (
    print_server_summary,
    prompt_upload_password,
)
from lansend.cli.validators import validate_directory
from lansend.common.config import LansendConfig
from lansend.features.files.service import FileShareService


@dataclass
class LaunchOptions:
    port: int
    directory: str
    ask_password: bool = False
    no_browser: bool = False
    hide_download: bool = False
    disable_upload: bool = False
    chat: bool = False


def build_config(options: LaunchOptions) -> LansendConfig | None:
    """构造服务配置，校验失败时返回 None。"""
    shared_directory = validate_directory(options.directory)
    if shared_directory is None:
        return None

    config = LansendConfig(
        shared_directory=shared_directory,
        upload_password=None,
        un_download=options.hide_download,
        un_upload=options.disable_upload,
        chat_enabled=options.chat,
    )
    config.upload_password = prompt_upload_password(
        options.ask_password, options.disable_upload
    )
    return config


def run_lansend(options: LaunchOptions) -> None:
    """执行 lansend 的启动流程。"""
    config = build_config(options)
    if config is None:
        return

    if not check_port(options.port):
        return

    networks = get_private_networks()
    url = print_server_summary(
        shared_directory=config.shared_directory or ".",
        port=options.port,
        networks=networks,
        upload_password_enabled=bool(config.upload_password),
    )

    file_service = FileShareService(config)
    if not options.no_browser and url:
        server_thread = threading.Thread(
            target=start_web_server,
            args=(options.port, file_service),
            daemon=True,
        )
        server_thread.start()
        if wait_for_server_ready(options.port):
            open_browser(url)
        server_thread.join()
    else:
        start_web_server(options.port, file_service)
