/* The graph uses world coordinates. Pan and zoom only move its camera. */
function mountForceGraph(viewport, data, connections, activate) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = document.createElement('div');
  stage.className = 'graph-stage';
  const drawing = document.createElementNS(svgNamespace, 'svg');
  drawing.setAttribute('aria-hidden', 'true');
  stage.append(drawing);
  viewport.append(stage);

  const nodeByKey = new Map();
  const nodeByButton = new Map();
  const nodes = data.map((item, index) => {
    const angle = index * 2.39996;
    const radius = 24 * Math.sqrt(index);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'graph-dot ' + item.type;
    button.setAttribute('aria-label', (item.type === 'machine' ? 'Filtra per macchina ' : 'Apri progetto ') + item.name);
    const label = document.createElement('span');
    label.textContent = item.name;
    button.append(label);
    stage.append(button);
    const node = {...item, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
      vx:0, vy:0, button, degree:0};
    nodeByKey.set(item.key, node);
    nodeByButton.set(button, node);
    button.onclick = () => activate(node);
    return node;
  });
  const edges = connections.map(([from,to]) => {
    const a = nodeByKey.get(from), b = nodeByKey.get(to);
    a.degree++;
    b.degree++;
    const line = document.createElementNS(svgNamespace,'line');
    drawing.append(line);
    return {a,b,line};
  });
  for (const node of nodes) {
    node.button.style.setProperty('--dot-size', (11 + Math.min(node.degree, 8) * 1.5) + 'px');
  }
  let panX = 0, panY = 0, zoom = 1;
  let gesture = null, frame = 0, remaining = 0, suppressClick = false;
  let cameraTouched = false;
  const cellSize = 130;

  function step() {
    const grid = new Map();
    for (const n of nodes) {
      const col = Math.floor(n.x / cellSize), row = Math.floor(n.y / cellSize);
      const key = col + ',' + row;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(n);
      n.col = col;
      n.row = row;
    }
    for (const n of nodes) {
      n.vx -= n.x * .0018;
      n.vy -= n.y * .0018;
      for (let x = n.col - 1; x <= n.col + 1; x++) {
        for (let y = n.row - 1; y <= n.row + 1; y++) {
          for (const other of grid.get(x + ',' + y) || []) {
            if (other === n) continue;
            const dx = n.x - other.x, dy = n.y - other.y;
            const distance = Math.max(5, Math.hypot(dx, dy));
            if (distance > cellSize) continue;
            const push = Math.min(5, 2800 / (distance * distance)) / distance;
            n.vx += dx * push;
            n.vy += dy * push;
          }
        }
      }
    }
    for (const {a,b} of edges) {
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx,dy));
      const spring = (distance - 92) * .017 / (distance * Math.sqrt(Math.max(a.degree,b.degree)));
      a.vx += dx * spring;
      a.vy += dy * spring;
      b.vx -= dx * spring;
      b.vy -= dy * spring;
    }
    for (const n of nodes) {
      if (gesture?.node === n && gesture.moved) {
        n.vx = n.vy = 0;
        continue;
      }
      n.vx = Math.max(-12, Math.min(12, n.vx * .82));
      n.vy = Math.max(-12, Math.min(12, n.vy * .82));
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  function paint() {
    stage.style.transform = 'translate(' + panX + 'px,' + panY + 'px)';
    for (const n of nodes) {
      n.button.style.left = n.x * zoom + 'px';
      n.button.style.top = n.y * zoom + 'px';
    }
    for (const {a,b,line} of edges) {
      line.setAttribute('x1', a.x * zoom);
      line.setAttribute('y1', a.y * zoom);
      line.setAttribute('x2', b.x * zoom);
      line.setAttribute('y2', b.y * zoom);
    }
  }

  function fit() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX,n.x); maxX = Math.max(maxX,n.x);
      minY = Math.min(minY,n.y); maxY = Math.max(maxY,n.y);
    }
    zoom = Math.min(1.5, Math.max(.05, Math.min(
      (viewport.clientWidth - 96) / Math.max(100,maxX - minX),
      (viewport.clientHeight - 96) / Math.max(100,maxY - minY)
    )));
    panX = -(minX + maxX) / 2 * zoom;
    panY = -(minY + maxY) / 2 * zoom;
  }

  function animate() {
    frame = 0;
    if (!viewport.isConnected || viewport.clientWidth === 0) return;
    step();
    remaining--;
    if (!cameraTouched && remaining % 10 === 0) fit();
    paint();
    if (remaining > 0 || gesture?.moved) frame = requestAnimationFrame(animate);
  }

  function wake(ticks = 150) {
    if (reducedMotion) { paint(); return; }
    remaining = ticks;
    if (!frame) frame = requestAnimationFrame(animate);
  }

  viewport.addEventListener('pointerdown', event => {
    if (gesture || event.button !== 0 || !event.isPrimary) return;
    const button = event.target.closest('.graph-dot');
    const node = nodeByButton.get(button);
    suppressClick = false;
    gesture = {id:event.pointerId, node, clientX:event.clientX, clientY:event.clientY,
      x:node ? node.x : panX, y:node ? node.y : panY, moved:false};
  });
  viewport.addEventListener('pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.clientX, dy = event.clientY - gesture.clientY;
    if (!gesture.moved && Math.hypot(dx,dy) < 5) return;
    if (!gesture.moved) {
      gesture.moved = true;
      cameraTouched = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('dragging');
    }
    if (gesture.node) {
      gesture.node.x = gesture.x + dx / zoom;
      gesture.node.y = gesture.y + dy / zoom;
      wake();
    } else {
      panX = gesture.x + dx;
      panY = gesture.y + dy;
      paint();
    }
  });
  function endPointer(event) {
    if (gesture?.id !== event.pointerId) return;
    suppressClick = gesture.moved;
    gesture = null;
    viewport.classList.remove('dragging');
    if (suppressClick) setTimeout(() => { suppressClick = false; }, 0);
  }
  viewport.addEventListener('pointerup', endPointer);
  // Capture is on the viewport after a drag. Leave handles a press that never became a drag.
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('lostpointercapture', endPointer);
  viewport.addEventListener('pointerleave', event => {
    if (gesture && !gesture.moved) endPointer(event);
  });
  viewport.addEventListener('click', event => {
    if (suppressClick && event.detail) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  viewport.parentElement.querySelector('.graph-controls').onclick = event => {
    const action = event.target.closest('button')?.dataset.graphAction;
    if (!action) return;
    cameraTouched = true;
    if (action === 'fit') fit();
    else {
      const next = Math.max(.05, Math.min(4, zoom * (action === 'in' ? 1.3 : 1/1.3)));
      panX *= next / zoom;
      panY *= next / zoom;
      zoom = next;
    }
    paint();
  };
  for (let i = 0; i < (nodes.length > 400 ? 12 : 55); i++) step();
  fit();
  paint();
  wake();
}
