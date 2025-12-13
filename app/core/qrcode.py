"""二维码功能模块"""
import os
from io import BytesIO
import qrcode
from pyzbar.pyzbar import decode
from PIL import Image
from app.core.config import settings


def generate_qrcode(data: str, filename: str = None) -> str or BytesIO:
    """生成二维码
    
    Args:
        data: 要编码的数据
        filename: 保存文件名，若为None则返回BytesIO对象
    
    Returns:
        保存路径或BytesIO对象
    """
    # 创建二维码实例
    qr = qrcode.QRCode(
        version=settings.QR_CODE_VERSION,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    
    # 添加数据
    qr.add_data(data)
    qr.make(fit=True)
    
    # 生成图片
    img = qr.make_image(fill_color="black", back_color="white")
    
    # 调整大小
    img = img.resize((settings.QR_CODE_SIZE, settings.QR_CODE_SIZE), Image.Resampling.LANCZOS)
    
    if filename:
        # 保存到文件
        qr_dir = os.path.join(settings.UPLOAD_DIR, "qrcodes")
        os.makedirs(qr_dir, exist_ok=True)
        filepath = os.path.join(qr_dir, filename)
        img.save(filepath)
        return filepath
    else:
        # 返回BytesIO对象
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer


def scan_qrcode(image_path: str) -> list:
    """扫描二维码
    
    Args:
        image_path: 图片路径
    
    Returns:
        二维码内容列表
    """
    # 打开图片
    img = Image.open(image_path)
    
    # 扫描二维码
    decoded_objects = decode(img)
    
    # 提取数据
    results = []
    for obj in decoded_objects:
        results.append({
            "type": obj.type,
            "data": obj.data.decode("utf-8"),
            "rect": {
                "x": obj.rect.left,
                "y": obj.rect.top,
                "width": obj.rect.width,
                "height": obj.rect.height
            }
        })
    
    return results


def generate_note_qrcode(note_id: int, base_url: str = "http://localhost:8000") -> str:
    """生成笔记分享二维码
    
    Args:
        note_id: 笔记ID
        base_url: 基础URL
    
    Returns:
        二维码图片路径
    """
    # 构建分享URL
    share_url = f"{base_url}/notes/share/{note_id}"
    
    # 生成二维码
    filename = f"note_{note_id}.png"
    return generate_qrcode(share_url, filename)


def decode_qrcode_from_bytes(image_bytes: bytes) -> list:
    """从字节流中解码二维码
    
    Args:
        image_bytes: 图片字节流
    
    Returns:
        二维码内容列表
    """
    # 打开图片
    img = Image.open(BytesIO(image_bytes))
    
    # 扫描二维码
    return scan_qrcode(img)
