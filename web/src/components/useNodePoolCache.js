export const useNodePoolCache = ({ apiBase, token, nodePoolCache }) => {
  let pendingRequest = null;

  const loadNodePoolCache = async () => {
    if (nodePoolCache.value.length > 0) return nodePoolCache.value;
    if (pendingRequest) return pendingRequest;
    pendingRequest = (async () => {
      try {
        const response = await fetch(`${apiBase}/api/nodes?limit=100000`, {
          headers: { Authorization: `Bearer ${token.value}` },
        });
        if (response.ok) nodePoolCache.value = (await response.json()).nodes || [];
      } catch (error) {
        console.error("加载节点池缓存失败", error);
      } finally {
        pendingRequest = null;
      }
      return nodePoolCache.value;
    })();
    return pendingRequest;
  };

  return { loadNodePoolCache };
};
