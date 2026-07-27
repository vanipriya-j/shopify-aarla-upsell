import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Aarla Promotions</h1>
        <p className={styles.text}>
          One configurable storefront promotional popup for the Aarla Shopify
          store — powered by a Theme App Extension, without editing
          theme.liquid.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Theme app embed</strong>. Load the popup without editing
            theme.liquid directly.
          </li>
          <li>
            <strong>One promotion at a time</strong>. UTM, landing page, then
            first-time welcome — never two popups together.
          </li>
          <li>
            <strong>Shopify-owned discounts</strong>. Display and deep-link
            codes; Shopify validates and applies them.
          </li>
        </ul>
      </div>
    </div>
  );
}
