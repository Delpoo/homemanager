"""Fictional plan images: validation, permission, quota and backup restore."""
import base64
import json
from pathlib import Path
from copy import deepcopy
from unittest.mock import AsyncMock
import pytest
from homeassistant.helpers.storage import Store
from custom_components.homemanager.images import image_data, put_image, get_image, scope_key
from custom_components.homemanager.store import HomeManagerStore
from custom_components.homemanager.errors import ModelError
from custom_components.homemanager.validation import validate_configuration
from custom_components.homemanager.const import MAX_TOTAL_STORAGE_BYTES, STORAGE_VERSION

SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect width="10" height="10"/></svg>'
def raw(source=SVG):return {"format":"svg","content":base64.b64encode(source.encode()).decode()}

def test_shared_plan_view_contract():
    cases=json.loads((Path(__file__).parents[1]/'fixtures'/'plan-views.json').read_text())
    for expected, entries in ((True,cases['valid']),(False,cases['invalid'])):
        for views in entries:
            c={**deepcopy(cases['base']),"planViews":views}
            if expected: assert validate_configuration(c)==c
            else:
                with pytest.raises(ModelError):validate_configuration(c)

def test_images_reject_active_svg_oversize_and_wrong_formats():
    image_data(raw())
    for value in (raw(SVG.replace('<rect width="10" height="10"/>','<script/>')),raw('x'*1048577),{"format":"png","content":base64.b64encode(b'not png').decode()},{"format":"jpg","content":base64.b64encode(b'not jpg').decode()}):
        with pytest.raises(ModelError):image_data(value)

async def test_image_persistence_restore_and_quota(hass):
    store=HomeManagerStore(hass)
    image=await put_image(store,'example',raw())
    assert (await get_image(store,'example',image['sha256']))==image
    disk=Store(hass,STORAGE_VERSION,scope_key('example'),atomic_writes=True)
    backup=deepcopy(await disk.async_load())
    await disk.async_remove()
    await disk.async_save(backup)
    restored=HomeManagerStore(hass)
    assert (await get_image(restored,'example',image['sha256']))==image
    restored._usage=AsyncMock(return_value={'homemanager.homes':MAX_TOTAL_STORAGE_BYTES})
    with pytest.raises(ModelError,match='quota'):
        await put_image(restored,'example',raw(SVG.replace('10','11')))
    assert (await get_image(restored,'example',image['sha256']))==image

async def test_image_websocket_has_same_read_permissions_and_admin_writes(hass,setup_integration,hass_ws_client,hass_user):
    client=await hass_ws_client(hass)
    await client.send_json_auto_id({"type":"homemanager/image/put","scope":"example","image":raw()})
    result=await client.receive_json();assert result['success']
    sha=result['result']['sha256']
    await client.send_json_auto_id({"type":"homemanager/image/get","scope":"example","sha256":sha})
    assert (await client.receive_json())['success']
    hass_user.is_admin=False
    await client.send_json_auto_id({"type":"homemanager/image/put","scope":"example","image":raw()})
    assert (await client.receive_json())['success'] is False
    await client.send_json_auto_id({"type":"homemanager/image/get","scope":"example","sha256":sha})
    assert (await client.receive_json())['success'] is False


def test_valid_static_png_and_jpeg():
    for raw in json.loads((Path(__file__).parents[1]/'fixtures'/'image-bytes.json').read_text()):
        image=image_data(raw)
        assert image['format']==raw['format']
        assert image['content']==raw['content']
