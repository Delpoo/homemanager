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
from custom_components.homemanager.const import MAX_TOTAL_STORAGE_BYTES, STORAGE_VERSION, CONF_VIEWER_USER_IDS

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

async def test_image_websocket_has_same_read_permissions_and_admin_writes(hass,setup_integration,hass_ws_client,hass_read_only_user,hass_read_only_access_token):
    client=await hass_ws_client(hass)
    await client.send_json_auto_id({"type":"homemanager/image/put","scope":"example","image":raw()})
    result=await client.receive_json();assert result['success']
    sha=result['result']['sha256']
    await client.send_json_auto_id({"type":"homemanager/image/get","scope":"example","sha256":sha})
    assert (await client.receive_json())['success']
    reader=await hass_ws_client(hass,hass_read_only_access_token)
    await reader.send_json_auto_id({"type":"homemanager/image/put","scope":"example","image":raw()})
    assert (await reader.receive_json())['error']['code']=='unauthorized'
    await reader.send_json_auto_id({"type":"homemanager/image/get","scope":"example","sha256":sha})
    assert (await reader.receive_json())['error']['code']=='unauthorized'
    hass.config_entries.async_update_entry(setup_integration,options={CONF_VIEWER_USER_IDS:[hass_read_only_user.id]})
    await hass.async_block_till_done()
    await reader.send_json_auto_id({"type":"homemanager/image/get","scope":"example","sha256":sha})
    assert (await reader.receive_json())['result']['sha256']==sha
    await reader.send_json_auto_id({"type":"homemanager/image/put","scope":"example","image":raw()})
    assert (await reader.receive_json())['error']['code']=='unauthorized'


def test_shared_now_panel_contract():
    cases=json.loads((Path(__file__).parents[1]/'fixtures'/'plan-views.json').read_text())
    for expected, entries in ((True,cases['panelsValid']),(False,cases['panelsInvalid'])):
        for panels in entries:
            c={**deepcopy(cases['base']),"nowPanels":panels}
            if expected: assert validate_configuration(c)==c
            else:
                with pytest.raises(ModelError):validate_configuration(c)


def test_valid_static_png_and_jpeg():
    for raw in json.loads((Path(__file__).parents[1]/'fixtures'/'image-bytes.json').read_text()):
        image=image_data(raw)
        assert image['format']==raw['format']
        assert image['content']==raw['content']


# --- #63: images no saved plan shows are cleaned up -------------------------
def _with_views(images):
    cases = json.loads((Path(__file__).parents[1] / 'fixtures' / 'plan-views.json').read_text())
    views = [{"id": f"v{i}", "name": f"Vista {i}", "light": {"scope": "example", "sha256": sha, "format": "svg", "box": [0, 0, 100, 80]}} for i, sha in enumerate(images)]
    return {**deepcopy(cases['base']), **({"planViews": views} if views else {})}


async def _stored(hass):
    return ((await Store(hass, STORAGE_VERSION, scope_key('example'), atomic_writes=True).async_load()) or {"images": {}})["images"]


async def test_replacing_an_image_and_saving_keeps_a_single_image(hass):
    store = HomeManagerStore(hass)
    await store.async_load()
    first = await put_image(store, 'example', raw())
    home = await store.async_save('casa-ficticia', None, _with_views([first['sha256']]), None, None)
    second = await put_image(store, 'example', raw(SVG.replace('10', '12')))
    # Uploaded but not saved yet: a draft may still need it.
    assert set(await _stored(hass)) == {first['sha256'], second['sha256']}
    await store.async_save('casa-ficticia', home.revision, _with_views([second['sha256']]), None, None)
    assert set(await _stored(hass)) == {second['sha256']}
    assert (await get_image(store, 'example', second['sha256']))['sha256'] == second['sha256']


async def test_an_image_another_home_uses_is_never_removed(hass):
    store = HomeManagerStore(hass)
    await store.async_load()
    shared = await put_image(store, 'example', raw())
    await store.async_save('casa-a', None, _with_views([shared['sha256']]), None, None)
    home_b = await store.async_save('casa-b', None, _with_views([shared['sha256']]), None, None)
    await store.async_save('casa-b', home_b.revision, _with_views([]), None, None)
    assert set(await _stored(hass)) == {shared['sha256']}


async def test_an_unsaved_upload_waits_and_old_unused_images_go(hass):
    from datetime import timedelta
    from homeassistant.util import dt as dt_util
    from custom_components.homemanager.images import prune_images, UNSAVED_GRACE
    store = HomeManagerStore(hass)
    await store.async_load()
    fresh = await put_image(store, 'example', raw())
    await store.async_save('casa-ficticia', None, _with_views([]), None, None)
    assert set(await _stored(hass)) == {fresh['sha256']}
    async with store._lock:
        await prune_images(store, [], dt_util.utcnow() + UNSAVED_GRACE + timedelta(minutes=1))
    # The scope emptied: its file is gone and no longer counts for the quota.
    assert await Store(hass, STORAGE_VERSION, scope_key('example'), atomic_writes=True).async_load() is None
    assert 'homemanager.images.example' not in store._sizes


async def test_deleting_and_purging_a_home_removes_its_images(hass):
    store = HomeManagerStore(hass)
    await store.async_load()
    image = await put_image(store, 'example', raw())
    home = await store.async_save('casa-ficticia', None, _with_views([image['sha256']]), None, None)
    await store.async_delete('casa-ficticia', home.revision)
    # Kept while the deleted home's history is kept.
    assert set(await _stored(hass)) == {image['sha256']}
    await store.async_purge_history('casa-ficticia')
    assert await Store(hass, STORAGE_VERSION, scope_key('example'), atomic_writes=True).async_load() is None


async def test_quota_message_names_images_when_they_fill_it():
    from custom_components.homemanager.storage_policy import check_quota
    with pytest.raises(ModelError, match='plan images use most of it'):
        check_quota({'homemanager.homes': 1000, 'homemanager.images.example': MAX_TOTAL_STORAGE_BYTES})
    with pytest.raises(ModelError, match='purge a retained'):
        check_quota({'homemanager.homes': MAX_TOTAL_STORAGE_BYTES, 'homemanager.images.example': 1000})
