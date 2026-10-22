function tileRect(area, widthDip, scale, edge, minimumAppDip = 480) {
  if (![...Object.values(area), widthDip, scale].every(Number.isFinite) || widthDip <= 0 || scale <= 0 || !['left', 'right'].includes(edge)) {
    throw new Error('invalid-geometry')
  }
  const width = Math.round(widthDip * scale)
  if (area.right - area.left - width < Math.round(minimumAppDip * scale) || area.bottom <= area.top) {
    throw new Error('insufficient-space')
  }
  return {
    left: edge === 'left' ? area.left + width : area.left,
    top: area.top,
    right: edge === 'right' ? area.right - width : area.right,
    bottom: area.bottom
  }
}

function outerRect(target, outer, visible) {
  return Object.fromEntries(['left', 'top', 'right', 'bottom'].map(key => [key, target[key] + outer[key] - visible[key]]))
}

function equalRect(a, b, tolerance = 2) {
  return ['left', 'top', 'right', 'bottom'].every(key => Math.abs(a[key] - b[key]) <= tolerance)
}

module.exports = { tileRect, outerRect, equalRect }
