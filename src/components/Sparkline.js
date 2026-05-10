import React, { useMemo } from 'react';

// SVG sparkline. Path string is memoized off the data array reference,
// so as long as marketSim re-uses the same history array between ticks
// (it doesn't — but the per-render cost is one map+join over ≤120
// numbers, ~microseconds) the path doesn't recompute.
//
// Color auto-derives from start-vs-end direction. If the line ends
// higher than it started, render in green; lower, red. Override with
// the `color` prop.
//
// `fluid` makes the SVG stretch to its container width while keeping
// the viewBox aspect — used for the large detail-page sparkline that
// scales on mobile.
function Sparkline({
  data,
  width = 80,
  height = 24,
  fluid = false,
  strokeWidth = 1.5,
  color: colorOverride,
  showFill = false,
  ariaLabel,
}) {
  const { path, areaPath, color } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', areaPath: '', color: colorOverride || '#9a9880' };
    }
    let min = data[0];
    let max = data[0];
    for (let i = 1; i < data.length; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || max * 0.0001 || 1;
    const stepX = width / (data.length - 1);
    let pathD = '';
    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = height - ((data[i] - min) / range) * height;
      pathD += (i === 0 ? 'M' : ' L') + x.toFixed(2) + ',' + y.toFixed(2);
    }
    const finalColor = colorOverride
      || (data[data.length - 1] >= data[0] ? '#5ab87a' : '#c45555');
    const area = pathD
      + ` L${width.toFixed(2)},${height.toFixed(2)}`
      + ` L0,${height.toFixed(2)} Z`;
    return { path: pathD, areaPath: area, color: finalColor };
  }, [data, width, height, colorOverride]);

  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      style={{ display: 'block' }}
    >
      {showFill && areaPath && (
        <path d={areaPath} fill={color} fillOpacity={0.12} />
      )}
      <path
        d={path}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default React.memo(Sparkline);
