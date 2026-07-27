/**
 * Expand QUALIFYING_COLLECTION targets into QUALIFYING_PRODUCT IDs via Admin GraphQL.
 */

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/**
 * @param admin Shopify admin GraphQL client from authenticate.admin
 * @param collectionGid Collection GID (gid://shopify/Collection/...)
 * @param maxProducts Safety cap for V1 expansion
 */
export async function expandCollectionToProductIds(
  admin: AdminGraphql,
  collectionGid: string,
  maxProducts = 250,
): Promise<string[]> {
  const productIds: string[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext && productIds.length < maxProducts) {
    const response = await admin.graphql(
      `#graphql
      query CollectionProducts($id: ID!, $cursor: String) {
        collection(id: $id) {
          products(first: 50, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { id }
          }
        }
      }`,
      { variables: { id: collectionGid, cursor } },
    );
    const json = await response.json();
    const connection = json?.data?.collection?.products;
    if (!connection) break;

    for (const node of connection.nodes || []) {
      if (node?.id) productIds.push(node.id);
      if (productIds.length >= maxProducts) break;
    }

    hasNext = Boolean(connection.pageInfo?.hasNextPage);
    cursor = connection.pageInfo?.endCursor || null;
  }

  return productIds;
}

/**
 * Given mixed targets, keep originals and add expanded product IDs for collections.
 */
export async function withExpandedQualifyingProducts(
  admin: AdminGraphql,
  targets: Array<{ targetType: string; shopifyResourceId: string }>,
) {
  const result = [...targets];
  const existingProducts = new Set(
    targets
      .filter((t) => t.targetType === "QUALIFYING_PRODUCT")
      .map((t) => t.shopifyResourceId),
  );

  for (const target of targets) {
    if (target.targetType !== "QUALIFYING_COLLECTION") continue;
    const productIds = await expandCollectionToProductIds(
      admin,
      target.shopifyResourceId,
    );
    for (const productId of productIds) {
      if (existingProducts.has(productId)) continue;
      existingProducts.add(productId);
      result.push({
        targetType: "QUALIFYING_PRODUCT",
        shopifyResourceId: productId,
      });
    }
  }

  return result;
}
