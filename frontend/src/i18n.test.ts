import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { messages } from "./i18n-catalog";
import { count, getLocale, message, setLocale, t } from "./i18n";

afterEach(() => setLocale("ru"));
test("Russian is the default and every catalog entry retains its interpolation parameters", () => {
  assert.equal(getLocale(), "ru");
  const params = (value: string) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, translations] of Object.entries(messages))
    for (const copy of translations) {
      assert.ok(copy.trim(), key);
      assert.deepEqual(params(copy), params(key), key);
    }
});
test("product labels and plural forms work in all three languages without altering unknown data", () => {
  for (const [locale, overview, one, five] of [
    ["ru", "Обзор", "1 диалог", "5 диалогов"],
    ["en", "Overview", "1 conversation", "5 conversations"],
    ["kk", "Шолу", "1 диалог", "5 диалог"],
  ] as const) {
    setLocale(locale);
    assert.equal(t("Overview"), overview);
    assert.equal(count("conversations", 1), one);
    assert.equal(count("conversations", 5), five);
    assert.equal(
      t("Open {arg0}", { arg0: "p1-kz-001" }).includes("p1-kz-001"),
      true,
    );
    assert.equal(
      t("Conversation custom user content"),
      "Conversation custom user content",
    );
    assert.equal(
      t("Сәлеметсіз бе! Original RU/KZ/EN text."),
      "Сәлеметсіз бе! Original RU/KZ/EN text.",
    );
  }
  setLocale("ru");
  assert.equal(count("conversations", 22), "22 диалога");
  assert.equal(
    message("Conversation 2 needs at least one transcript turn."),
    "Диалог 2 должен содержать хотя бы одну реплику.",
  );
});
test("every static translated UI label has both Russian and Kazakh copy", () => {
  for (const file of readdirSync(new URL(".", import.meta.url)).filter(
    (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"),
  )) {
    const source = ts.createSourceFile(
      file,
      readFileSync(new URL(file, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text.trim().replace(/\s+/g, " ");
        assert.ok(messages[key], `${file}: missing translation for ${key}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
