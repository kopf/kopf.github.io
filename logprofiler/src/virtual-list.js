export function createVirtualList(container, options) {
  const rowHeight = options.rowHeight ?? 24;
  const overscan = options.overscan ?? 12;
  const renderRow = options.renderRow;

  let items = [];

  const spacer = document.createElement("div");
  spacer.className = "vlist-spacer";
  container.append(spacer);

  function visibleWindow() {
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
    );
    return { startIndex, endIndex };
  }

  function render() {
    spacer.style.height = `${items.length * rowHeight}px`;
    spacer.replaceChildren();

    if (items.length === 0) {
      return;
    }

    const { startIndex, endIndex } = visibleWindow();
    const fragment = document.createDocumentFragment();

    for (let index = startIndex; index < endIndex; index += 1) {
      const item = items[index];
      const row = renderRow(item, index);
      fragment.append(row);
    }

    spacer.append(fragment);
  }

  function setItems(nextItems) {
    items = nextItems;
    render();
  }

  function scrollToIndex(index) {
    container.scrollTop = index * rowHeight;
    render();
  }

  container.addEventListener("scroll", render, { passive: true });
  window.addEventListener("resize", render);

  return {
    setItems,
    scrollToIndex
  };
}
