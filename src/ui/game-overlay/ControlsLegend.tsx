export function ControlsLegend() {
  return (
    <dl className="controls">
      <div className="glass-card controls__item">
        <dt>Drive</dt>
        <dd>
          <span className="controls__desktop">W / S / Up / Down</span>
          <span className="controls__touch">Go / Brake</span>
        </dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Steer</dt>
        <dd>
          <span className="controls__desktop">A / D / Left / Right</span>
          <span className="controls__touch">Left / Right</span>
        </dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Drift</dt>
        <dd>
          <span className="controls__desktop">Space / Shift</span>
          <span className="controls__touch">Drift button</span>
        </dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Pause</dt>
        <dd>
          <span className="controls__desktop">Esc</span>
          <span className="controls__touch">Pause</span>
        </dd>
      </div>
      <div className="glass-card controls__item">
        <dt>Gamepad</dt>
        <dd>
          <span className="controls__desktop">A / RT / LT / Menu</span>
          <span className="controls__touch">Desktop only</span>
        </dd>
      </div>
    </dl>
  )
}
