import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ScanResult {
  products: ProductInfo[];
  pages: PageInfo[];
  articles: ArticleInfo[];
  policies: PolicyInfo;
  shop: ShopInfo;
  scannedAt: string;
}

export interface ProductInfo {
  id: string;
  title: string;
  description: string;
  bodyHtml: string;
  variants: { price: string }[];
  status: string;
  productType: string;
}

export interface PageInfo {
  id: string;
  title: string;
  body: string;
}

export interface ArticleInfo {
  id: string;
  title: string;
  contentHtml: string;
  blogTitle: string;
}

export interface PolicyInfo {
  refundPolicy: string | null;
  privacyPolicy: string | null;
  termsOfService: string | null;
  shippingPolicy: string | null;
}

export interface ShopInfo {
  name: string;
  description: string;
}

/**
 * Scan a Shopify store via GraphQL to gather product, page, and policy data.
 */
export async function scanStore(
  admin: AdminApiContext,
): Promise<ScanResult> {
  const [products, pages, articles, shopData] = await Promise.all([
    fetchProducts(admin),
    fetchPages(admin),
    fetchArticles(admin),
    fetchShopAndPolicies(admin),
  ]);

  return {
    products,
    pages,
    articles,
    policies: shopData.policies,
    shop: shopData.shop,
    scannedAt: new Date().toISOString(),
  };
}

async function fetchProducts(
  admin: AdminApiContext,
): Promise<ProductInfo[]> {
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            description
            bodyHtml
            variants(first: 5) {
              edges {
                node {
                  price
                }
              }
            }
            status
            productType
          }
        }
      }
    }
  `);

  const data = await response.json();
  return data.data.products.edges.map((edge: any) => ({
    id: edge.node.id,
    title: edge.node.title,
    description: edge.node.description,
    bodyHtml: edge.node.bodyHtml,
    variants: edge.node.variants.edges.map((v: any) => ({
      price: v.node.price,
    })),
    status: edge.node.status,
    productType: edge.node.productType,
  }));
}

async function fetchPages(admin: AdminApiContext): Promise<PageInfo[]> {
  const response = await admin.graphql(`
    query {
      pages(first: 50) {
        edges {
          node {
            id
            title
            body
          }
        }
      }
    }
  `);

  const data = await response.json();
  return data.data.pages.edges.map((edge: any) => ({
    id: edge.node.id,
    title: edge.node.title,
    body: edge.node.body,
  }));
}

async function fetchArticles(
  admin: AdminApiContext,
): Promise<ArticleInfo[]> {
  const response = await admin.graphql(`
    query {
      blogs(first: 5) {
        edges {
          node {
            title
            articles(first: 20) {
              edges {
                node {
                  id
                  title
                  contentHtml
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const articles: ArticleInfo[] = [];

  for (const blogEdge of data.data.blogs.edges) {
    const blogTitle = blogEdge.node.title;
    for (const articleEdge of blogEdge.node.articles.edges) {
      articles.push({
        id: articleEdge.node.id,
        title: articleEdge.node.title,
        contentHtml: articleEdge.node.contentHtml,
        blogTitle,
      });
    }
  }

  return articles;
}

async function fetchShopAndPolicies(
  admin: AdminApiContext,
): Promise<{ shop: ShopInfo; policies: PolicyInfo }> {
  const response = await admin.graphql(`
    query {
      shop {
        name
        description
        refundPolicy { body }
        privacyPolicy { body }
        termsOfService { body }
        shippingPolicy { body }
      }
    }
  `);

  const data = await response.json();
  const shop = data.data.shop;

  return {
    shop: {
      name: shop.name,
      description: shop.description || "",
    },
    policies: {
      refundPolicy: shop.refundPolicy?.body || null,
      privacyPolicy: shop.privacyPolicy?.body || null,
      termsOfService: shop.termsOfService?.body || null,
      shippingPolicy: shop.shippingPolicy?.body || null,
    },
  };
}
