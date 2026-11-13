/* Python 執行：用 Pyodide（瀏覽器內的 CPython）執行，提供 SPIKE App 3 的 API 子集 */
(function (SP) {
  'use strict';
  const VER = '0.26.4';
  const BASE = (window.SP_PYODIDE_BASE || 'https://cdn.jsdelivr.net/pyodide/v' + VER + '/full/');

  const PRELUDE = `
import sys, types, asyncio, ast, inspect
import _sp

def _mod(name, **attrs):
    m = types.ModuleType(name)
    m.__dict__.update(attrs)
    sys.modules[name] = m
    return m

def _pn(p):
    if not isinstance(p, int) or isinstance(p, bool) or p < 0 or p > 5:
        raise ValueError("無效的埠 %r（請用 port.A ～ port.F）" % (p,))
    return "ABCDEF"[p]

def _mpn(p):
    n = _pn(p)
    if n not in ("A", "B"):
        raise ValueError("埠 %s 沒有馬達（模擬器：A＝左輪、B＝右輪）" % n)
    return n

def _unsupported(what):
    def f(*a, **k):
        raise NotImplementedError("模擬器尚未支援 " + what)
    return f

class _Port:
    A, B, C, D, E, F = 0, 1, 2, 3, 4, 5
port = _Port()

# ---- 燈陣（編號與官方 light_matrix.IMAGE_* 常數相同）----
_IMG = ["HEART","HEART_SMALL","HAPPY","SMILE","SAD","CONFUSED","ANGRY","ASLEEP","SURPRISED","SILLY","FABULOUS","MEH","YES","NO",
        "CLOCK12","CLOCK1","CLOCK2","CLOCK3","CLOCK4","CLOCK5","CLOCK6","CLOCK7","CLOCK8","CLOCK9","CLOCK10","CLOCK11",
        "ARROW_N","ARROW_NE","ARROW_E","ARROW_SE","ARROW_S","ARROW_SW","ARROW_W","ARROW_NW","GO_RIGHT","GO_LEFT","GO_UP","GO_DOWN",
        "TRIANGLE","TRIANGLE_LEFT","CHESSBOARD","DIAMOND","DIAMOND_SMALL","SQUARE","SQUARE_SMALL","RABBIT","COW",
        "MUSIC_CROTCHET","MUSIC_QUAVER","MUSIC_QUAVERS","PITCHFORK","XMAS","PACMAN","TARGET","TSHIRT","ROLLERSKATE","DUCK",
        "HOUSE","TORTOISE","BUTTERFLY","STICKFIGURE","GHOST","SWORD","GIRAFFE","SKULL","UMBRELLA","SNAKE"]
class _LightMatrix:
    def show_image(self, image):
        _sp.lightImage(image)
    def show(self, pixels):
        pixels = list(pixels)
        if len(pixels) != 25:
            raise ValueError("show() 需要 25 個亮度值")
        _sp.lightShow(pixels)
    def clear(self):
        _sp.lightOff()
    def get_pixel(self, x, y):
        return _sp.lightGet(x, y)
    def set_pixel(self, x, y, intensity=100):
        if not (0 <= x <= 4 and 0 <= y <= 4):
            raise ValueError("燈的位置 x、y 要在 0～4 之間")
        _sp.lightPixel(x + 1, y + 1, intensity)
    def set_orientation(self, top):
        _sp.lightOrient(top)
        return top
    def get_orientation(self):
        return _sp.lightOrientGet()
    async def write(self, text, intensity=100, time_per_character=500):
        _sp.lightText(str(text))
        await _sp.wait(max(1, len(str(text))) * time_per_character / 1000)
for _i, _n in enumerate(_IMG):
    setattr(_LightMatrix, "IMAGE_" + _n, _i + 1)
light_matrix = _LightMatrix()

_mod("orientation", UP=0, RIGHT=1, DOWN=2, LEFT=3)

class _Button:
    LEFT = 1
    RIGHT = 2
    def pressed(self, button):
        return _sp.buttonMs("left" if button == 1 else "right")
button = _Button()

class _Light:
    POWER = 0
    CONNECT = 1
    def color(self, light, color):
        if light == 0:
            _sp.centerLight(color)
light = _Light()

class _Sound:
    ANY = -2; DEFAULT = -1
    WAVEFORM_SINE = 1; WAVEFORM_SAWTOOTH = 3; WAVEFORM_SQUARE = 2; WAVEFORM_TRIANGLE = 1
    async def beep(self, freq=440, duration=500, volume=100, *, attack=0, decay=0, sustain=100, release=0, transition=10, waveform=1, channel=-1):
        await _sp.beepHz(freq, duration / 1000)
    def stop(self):
        _sp.stopSounds()
    def volume(self, volume):
        pass
sound = _Sound()

class _Motion:
    TAPPED = 0; DOUBLE_TAPPED = 1; SHAKEN = 2; FALLING = 3; UNKNOWN = -1
    TOP = 0; FRONT = 1; RIGHT = 2; BOTTOM = 3; BACK = 4; LEFT = 5
    def tilt_angles(self):
        return tuple(_sp.tiltDeci())
    def reset_yaw(self, angle=0):
        _sp.resetYaw(angle)
    def stable(self):
        return True
    def gesture(self):
        return _sp.gestureNum()
    def up_face(self):
        return _sp.upFace()
    def get_yaw_face(self):
        return 0
    def set_yaw_face(self, up):
        if up != 0:
            raise ValueError("模擬器的機器人平放在地上，只支援 motion_sensor.TOP 當作偏航面")
        return True
    def tap_count(self):
        return _sp.tapCount()
    def reset_tap_count(self):
        _sp.resetTaps()
    acceleration = _unsupported("motion_sensor.acceleration（沒有模擬加速度）")
    angular_velocity = _unsupported("motion_sensor.angular_velocity")
    quaternion = _unsupported("motion_sensor.quaternion")
motion_sensor = _Motion()
_hub = _mod("hub", port=port, light_matrix=light_matrix, motion_sensor=motion_sensor, sound=sound, button=button, light=light)

# ---- runloop ----
_q = []
async def _wrap(c):
    try:
        await c
    except SystemExit:
        _sp.stopSim()
class _Runloop:
    def run(self, *coros):
        for c in coros:
            _q.append(_wrap(c))
    async def sleep_ms(self, ms):
        await _sp.wait(ms / 1000)
    async def until(self, function, timeout=0):
        t0 = _sp.ticksMs()
        while True:
            ok = function()
            if inspect.isawaitable(ok):
                ok = await ok
            if ok:
                return
            if timeout and _sp.ticksMs() - t0 >= timeout:
                return
            await _sp.wait(0)
    async def _drain(self):
        if _q:
            await asyncio.gather(*list(_q))
runloop = _Runloop()
_mod("runloop", run=runloop.run, sleep_ms=runloop.sleep_ms, until=runloop.until, _drain=runloop._drain, _q=_q)

# ---- 馬達 ----
class _Motor:
    READY = 0; RUNNING = 1; STALLED = 2; CANCELED = 3; CANCELLED = 3; ERROR = 4; DISCONNECTED = 5
    COAST = 0; BRAKE = 1; HOLD = 2; CONTINUE = 3; SMART_COAST = 4; SMART_BRAKE = 5
    CLOCKWISE = 0; COUNTERCLOCKWISE = 1; SHORTEST_PATH = 2; LONGEST_PATH = 3
    def run(self, port, velocity, *, acceleration=1000):
        _sp.motorRun(_mpn(port), velocity)
    async def run_for_degrees(self, port, degrees, velocity, *, stop=1, acceleration=1000, deceleration=1000):
        await _sp.motorDeg(_mpn(port), degrees, velocity)
        return 0
    async def run_for_time(self, port, duration, velocity, *, stop=1, acceleration=1000, deceleration=1000):
        await _sp.motorTime(_mpn(port), duration, velocity)
        return 0
    async def run_to_absolute_position(self, port, position, velocity, *, direction=2, stop=1, acceleration=1000, deceleration=1000):
        await _sp.motorGotoAbs(_mpn(port), position, abs(velocity), direction)
        return 0
    async def run_to_relative_position(self, port, position, velocity, *, stop=1, acceleration=1000, deceleration=1000):
        delta = position - _sp.motorPos(_mpn(port))
        await _sp.motorDeg(_mpn(port), delta, abs(velocity))
        return 0
    def stop(self, port, *, stop=1):
        _sp.motorStop(_mpn(port))
    def absolute_position(self, port):
        return _sp.motorAbs(_mpn(port))
    def relative_position(self, port):
        return _sp.motorPos(_mpn(port))
    def reset_relative_position(self, port, position=0):
        _sp.motorSetPos(_mpn(port), position)
    def velocity(self, port):
        return _sp.motorVel(_mpn(port))
    set_duty_cycle = _unsupported("motor.set_duty_cycle")
    get_duty_cycle = _unsupported("motor.get_duty_cycle")
motor = _Motor()
_mod("motor", **{k: getattr(motor, k) for k in dir(motor) if not k.startswith("__")})

class _MotorPair:
    PAIR_1 = 0; PAIR_2 = 1; PAIR_3 = 2
    def __init__(self):
        self._pairs = set()
    def pair(self, pair, left_motor, right_motor):
        if (left_motor, right_motor) != (0, 1):
            raise ValueError("模擬器目前只支援 motor_pair.pair(..., port.A, port.B)（A＝左輪、B＝右輪）")
        self._pairs.add(pair)
    def unpair(self, pair):
        self._pairs.discard(pair)
    def _chk(self, pair):
        if pair not in self._pairs:
            raise RuntimeError("請先用 motor_pair.pair(motor_pair.PAIR_1, port.A, port.B) 設定馬達組")
    def move(self, pair, steering, *, velocity=360, acceleration=1000):
        self._chk(pair); _sp.mpMove(steering, velocity)
    async def move_for_degrees(self, pair, degrees, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        self._chk(pair); await _sp.mpMoveDeg(abs(degrees), steering, velocity if degrees >= 0 else -velocity)
        return 0
    async def move_for_time(self, pair, duration, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        self._chk(pair); await _sp.mpMoveTime(duration, steering, velocity)
        return 0
    def move_tank(self, pair, left_velocity, right_velocity, *, acceleration=1000):
        self._chk(pair); _sp.mpTank(left_velocity, right_velocity)
    async def move_tank_for_degrees(self, pair, degrees, left_velocity, right_velocity, *, stop=1, acceleration=1000, deceleration=1000):
        self._chk(pair)
        s = 1 if degrees >= 0 else -1
        await _sp.mpTankDeg(abs(degrees), s * left_velocity, s * right_velocity)
        return 0
    async def move_tank_for_time(self, pair, left_velocity, right_velocity, duration, *, stop=1, acceleration=1000, deceleration=1000):
        self._chk(pair); await _sp.mpTankTime(duration, left_velocity, right_velocity)
        return 0
    def stop(self, pair, *, stop=1):
        _sp.mpStop()
motor_pair = _MotorPair()
_mod("motor_pair", **{k: getattr(motor_pair, k) for k in dir(motor_pair) if not k.startswith("_") or k == "pair"})

# ---- 感測器 ----
_mod("color", BLACK=0, MAGENTA=1, PURPLE=2, BLUE=3, AZURE=4, TURQUOISE=5, GREEN=6, YELLOW=7, ORANGE=8, RED=9, WHITE=10, UNKNOWN=-1)
class _ColorSensor:
    def color(self, port):
        return _sp.colorNum(_pn(port))
    def reflection(self, port):
        return _sp.light(_pn(port))
    def rgbi(self, port):
        return tuple(_sp.rgbi(_pn(port)))
color_sensor = _ColorSensor()
_mod("color_sensor", color=color_sensor.color, reflection=color_sensor.reflection, rgbi=color_sensor.rgbi)

class _Dist:
    def distance(self, port):
        return _sp.distMm(_pn(port))
    def clear(self, port):
        _sp.distLight(_pn(port), [0, 0, 0, 0])
    def _idx(self, x, y):
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValueError("距離感測器只有 4 顆燈：x、y 要是 0 或 1（官方文件寫 0～3，模擬器依實體 4 顆燈處理）")
        return y * 2 + x
    def get_pixel(self, port, x, y):
        return _sp.distLightGet(_pn(port), self._idx(x, y))
    def set_pixel(self, port, x, y, intensity):
        _sp.distLightSet(_pn(port), self._idx(x, y), intensity)
    def show(self, port, pixels):
        pixels = list(pixels)
        if len(pixels) != 4:
            raise ValueError("show() 需要 4 個亮度值")
        _sp.distLight(_pn(port), pixels)
distance_sensor = _Dist()
_mod("distance_sensor", distance=distance_sensor.distance, clear=distance_sensor.clear, get_pixel=distance_sensor.get_pixel, set_pixel=distance_sensor.set_pixel, show=distance_sensor.show)

class _Force:
    def pressed(self, port):
        return bool(_sp.pressed(_pn(port)))
    def force(self, port):
        return _sp.forceDeci(_pn(port))
    raw = _unsupported("force_sensor.raw（沒有原始力值）")
force_sensor = _Force()
_mod("force_sensor", pressed=force_sensor.pressed, force=force_sensor.force, raw=force_sensor.raw)

class _Device:
    def ready(self, port):
        return _sp.deviceReady(_pn(port))
    id = _unsupported("device.id")
    data = _unsupported("device.data")
    get_duty_cycle = _unsupported("device.get_duty_cycle")
    set_duty_cycle = _unsupported("device.set_duty_cycle")
device = _Device()
_mod("device", ready=device.ready, id=device.id, data=device.data, get_duty_cycle=device.get_duty_cycle, set_duty_cycle=device.set_duty_cycle)

# ---- app 模組（圖表、音樂、顯示器等 App 功能，模擬器沒有）----
class _AppUnsupported:
    def __init__(self, name):
        self._name = name
    def __getattr__(self, k):
        raise NotImplementedError("模擬器尚未支援 app.%s（App 的圖表、音樂、顯示器功能）" % self._name)
_app = _mod("app")
for _n in ("bargraph", "linegraph", "display", "music", "sound"):
    setattr(_app, _n, _AppUnsupported(_n))
    sys.modules["app." + _n] = getattr(_app, _n)

import time as _time
_time.ticks_ms = _sp.ticksMs
def _blocked_sleep(*a):
    raise NotImplementedError("請改用 await runloop.sleep_ms(毫秒)（time.sleep_ms 會讓整個程式停住，模擬器不支援）")
_time.sleep_ms = _blocked_sleep

# 真正的主機有獨立的執行緒，while True 裡不寫 await 也可以；瀏覽器不行。
# 所以執行前在每個（位於 async def 或最外層的）迴圈開頭自動插入 await，讓模擬器前進一步。
async def _spike_tick():
    await _sp.wait(0)

class _AddTick(ast.NodeTransformer):
    def __init__(self):
        self.ok = [True]
    def visit_FunctionDef(self, node):
        self.ok.append(False); self.generic_visit(node); self.ok.pop(); return node
    def visit_Lambda(self, node):
        return node
    def visit_AsyncFunctionDef(self, node):
        self.ok.append(True); self.generic_visit(node); self.ok.pop(); return node
    def _loop(self, node):
        self.generic_visit(node)
        if self.ok[-1]:
            t = ast.Expr(ast.Await(ast.Call(ast.Name("__spike_tick__", ast.Load()), [], [])))
            ast.copy_location(t, node.body[0]); ast.copy_location(t.value, node.body[0]); ast.copy_location(t.value.value, node.body[0])
            ast.copy_location(t.value.value.func, node.body[0])
            node.body.insert(0, t)
        return node
    visit_While = _loop
    visit_For = _loop
    visit_AsyncFor = _loop

def _spike_reset():
    motor_pair._pairs.clear()
    _q.clear()

def _spike_check(src):
    ast.parse(src, "<exec>")

async def _spike_exec(src):
    tree = ast.parse(src, "<exec>")
    tree = _AddTick().visit(tree)
    ast.fix_missing_locations(tree)
    code = compile(tree, "<exec>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    g = {"__name__": "__main__", "__spike_tick__": _spike_tick}
    r = eval(code, g)
    if inspect.iscoroutine(r):
        await r
`;

  const ZH = [
    [/^NameError: name '(.+)' is not defined/, "名稱「$1」還沒有定義（拼錯字？還是忘了 import？）"],
    [/^SyntaxError: (.*)/, "語法錯誤：$1"],
    [/^IndentationError: (.*)/, "縮排錯誤：$1（同一層的程式要對齊）"],
    [/^TabError: (.*)/, "縮排錯誤：$1"],
    [/^ModuleNotFoundError: No module named '(.+)'/, "找不到模組「$1」（模擬器只支援 SPIKE 的 hub、motor、motor_pair、color_sensor… 等）"],
    [/^ImportError: cannot import name '(.+)' from '(.+)'/, "模組「$2」裡沒有「$1」"],
    [/^AttributeError: (.*)/, "沒有這個屬性或函式：$1（模擬器可能尚未支援）"],
    [/^TypeError: (.*)/, "型別或參數錯誤：$1"],
    [/^ValueError: (.*)/, "數值錯誤：$1"],
    [/^ZeroDivisionError: (.*)/, "不能除以 0"],
    [/^UnboundLocalError: (.*)/, "變數在指定值之前就被使用了：$1"],
    [/^RuntimeError: (.*)/, "$1"],
    [/^KeyError: (.*)/, "找不到鍵 $1"],
    [/^IndexError: (.*)/, "索引超出範圍：$1"],
  ];
  function translate(last) {
    for (const [re, to] of ZH) if (re.test(last)) return last.replace(re, to);
    return last;
  }

  let pyodide = null, loading = null, stopped = false, quiet = false, warned = new Set();
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('無法載入 Pyodide（需要網路）：' + src)); document.head.appendChild(s); });
  }
  async function ensure(onStatus) {
    if (pyodide) return pyodide;
    if (!loading) loading = (async () => {
      if (onStatus) onStatus('正在載入 Python 執行環境（第一次約 10 MB）…');
      if (!window.loadPyodide) await loadScript(BASE + 'pyodide.js');
      pyodide = await window.loadPyodide({ indexURL: BASE });
      if (onStatus) onStatus('');
      return pyodide;
    })();
    return loading;
  }

  function install(api, sim, io) {
    const pct = (v) => (Number(v) || 0) / 10;
    const m = {
      lightImage: (id) => api.lightImage(id), lightShow: (l) => api.lightShow(Array.from(l)), lightText: (t) => api.lightText(t),
      lightOff: () => api.lightOff(), lightPixel: (x, y, b) => api.lightPixel(x, y, b), lightGet: (x, y) => api.lightGet(x, y),
      lightOrient: (q) => api.lightOrient(q), lightOrientGet: () => api.lightOrientGet(), centerLight: (c) => api.centerLight(c),
      buttonMs: (side) => api.buttonMs(side),
      wait: (s) => api.wait(s),
      yawDeci: () => api.yawDeci(), resetYaw: (a) => api.resetYaw(a), ticksMs: () => api.ticksMs(),
      beepHz: (f, s) => api.beepHz(f, s), stopSounds: () => api.stopSounds(),
      mpMove: (st, v) => api.steer(pct(v), st), mpStop: () => api.stop(), mpTank: (l, r) => api.tank(pct(l), pct(r)),
      mpTankDeg: (d, l, r) => api.tankDegrees(d, pct(l), pct(r)),
      mpTankTime: async (ms, l, r) => { api.tank(pct(l), pct(r)); await api.wait(Number(ms) / 1000); api.stop(); },
      mpMoveDeg: (d, st, v) => api.moveDegrees(d, st, pct(v)), mpMoveTime: (ms, st, v) => api.moveTime(ms, st, pct(v)),
      motorRun: (p, v) => api.motorStart(p, pct(v)),
      motorDeg: (p, d, v) => api.motorTurnAt(p, Number(d) * (v < 0 ? -1 : 1), Math.abs(pct(v))),
      motorTime: async (p, ms, v) => { api.motorStart(p, pct(v)); await api.wait(Number(ms) / 1000); api.motorStop(p); },
      motorGotoAbs: (p, pos, v, dir) => api.motorGoto(p, dir === 0 ? 'cw' : dir === 1 ? 'ccw' : 'short', pos, Math.abs(pct(v))),
      motorStop: (p) => api.motorStop(p), motorPos: (p) => api.motorPos(p), motorAbs: (p) => api.motorPosAbs(p),
      motorSetPos: (p, v) => api.motorSetPos(p, v), motorVel: (p) => api.motorVel(p),
      tiltDeci: () => api.tiltDeci(), gestureNum: () => api.gestureNum(), upFace: () => api.upFace(), tapCount: () => api.tapCount(), resetTaps: () => api.resetTaps(),
      distLight: (p, l) => { api.distMm(p); api.distLight(...Array.from(l)); }, distLightGet: (p, i) => { api.distMm(p); return api.distLightGet(i); }, distLightSet: (p, i, v) => { api.distMm(p); api.distLightPixel(i, v); },
      colorNum: (p) => api.colorNum(p), light: (p) => api.light(p), rgbi: (p) => api.rgbi(p), distMm: (p) => api.distMm(p),
      pressed: (p) => api.pressed(p), forceDeci: (p) => api.forceDeci(p), deviceReady: (p) => api.deviceReady(p),
      stopSim: () => { stopped = true; api.stopSim(); },
    };
    pyodide.registerJsModule('_sp', m);
    pyodide.runPython(PRELUDE, { filename: '<sim>' });
    pyodide.setStdout({ batched: (s) => io.say(s) });
    pyodide.setStderr({ batched: (s) => {
      if (quiet) return;
      const mt = String(s).match(/coroutine '(?:\w+\.)?(\w+)' was never awaited/);
      const sw = String(s).match(/<exec>:(\d+): (\w+Warning): (.*)/);
      if (mt) { if (!/^_/.test(mt[1]) && io.warn && !warned.has(mt[1])) { warned.add(mt[1]); io.warn('忘了寫 await：「' + mt[1] + '」是需要等待完成的函式，前面要加 await，否則不會執行。'); } }
      else if (sw) {
        const key = sw[1] + sw[3];
        if (io.warn && !warned.has(key)) { warned.add(key); io.warn((/is/.test(sw[3]) && /literal/.test(sw[3]) ? '「is」不能用來比較數字，請改用 ==（' : '警告：') + sw[3] + (/literal/.test(sw[3]) ? '）' : ''), Number(sw[1])); }
      } else if (!/Enable tracemalloc/.test(s)) io.say(s);
    } });
  }

  // 回傳 { line, message, raw }
  function parseError(e) {
    const raw = String(e && e.message ? e.message : e);
    const lines = raw.trim().split('\n');
    const last = lines[lines.length - 1];
    let line = null;
    for (const l of lines) { const mt = l.match(/File "<exec>", line (\d+)/); if (mt) line = Number(mt[1]); }
    if (line === null) { const mt = raw.match(/\(<exec>, line (\d+)\)/); if (mt) line = Number(mt[1]); }
    let msg = last;
    if (/^(pyodide\.ffi\.)?JsException:/.test(last)) msg = last.replace(/^(pyodide\.ffi\.)?JsException:\s*(Error:\s*)?/, '');
    else msg = translate(last);
    return { line, message: msg, raw };
  }

  let installed = false;
  SP.py = {
    ensure,
    isLoaded: () => !!pyodide,
    async run(code, api, sim, io) {
      await ensure(io.status);
      if (!installed) { install(api, sim, io); installed = true; }
      stopped = false; sim._pyStopped = false; warned = new Set(); quiet = false;
      pyodide.runPython('_spike_reset()', { filename: '<sim>' });
      pyodide.globals.set('_user_src', code);
      try {
        await pyodide.runPythonAsync('await _spike_exec(_user_src)', { filename: '<sim>' });
        await pyodide.runPythonAsync('await sys.modules["runloop"]._drain()', { filename: '<sim>' });
      } catch (e) {
        if (stopped || e === SP.STOP) return { stopped: true };
        if (/Stop/.test(String(e && e.message)) && sim._userStopped) return { stopped: true };
        return { error: parseError(e) };
      } finally { quiet = true; try { pyodide.runPython('import gc; gc.collect()'); } catch (e) { /* 略 */ } quiet = false; }
      return { ok: true };
    },
    async check(code) {      // 只檢查語法（需要已經執行過一次、API 已安裝）
      if (!pyodide || !installed) return 'not-ready';
      pyodide.globals.set('_user_src', code);
      try { pyodide.runPython('_spike_check(_user_src)', { filename: '<sim>' }); return null; } catch (e) { return String(e.message).split('\n').slice(-2).join(' '); }
    },
    stop() { stopped = true; },
    parseError,
  };
})(window.SP = window.SP || {});
