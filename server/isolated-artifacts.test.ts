import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateIsolatedArtifacts, prepareArtifactStage, assertArtifactStage, sealArtifactReview, beginArtifactPublication } from "./isolated-artifacts.ts";

const contract = { contractType: "IsolatedArtifactsV1" as const, contractVersion: "1.0" as const, inputPaths: ["input.txt"], publishCommands: ['node "publish.mjs"'] };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-isolated-test-"));
  const project = join(root, "project");
  await mkdir(project);
  await writeFile(join(project, "input.txt"), "исходные данные");
  const stage = await prepareArtifactStage(project, join(root, "attempt"), contract);
  return { root, project, stage };
}

test("Изолированные результаты не изменяют оригинал и требуют ревью перед переносом", async () => {
  const { project, stage } = await fixture();
  await writeFile(join(stage.root, "result.json"), '{"ok":true}');
  await assertArtifactStage(stage, ["result.json"]);
  assert.equal(await readFile(join(project, "input.txt"), "utf8"), "исходные данные");
  await assert.rejects(readFile(join(project, "result.json")), /ENOENT/);
  await assert.rejects(beginArtifactPublication(stage, ["result.json"]), /review is required/);
  await sealArtifactReview(stage, ["result.json"]);
  await beginArtifactPublication(stage, ["result.json"]);
  await writeFile(join(stage.root, "result.json"), 'late change');
  assert.equal(await readFile(join(stage.sealedRoot!, "result.json"), "utf8"), '{"ok":true}');
  await assert.rejects(beginArtifactPublication(stage, ["result.json"]), /changed before publication|EEXIST/);
});

test("Изменение входа или результата после ревью блокирует перенос", async () => {
  const { project, stage } = await fixture();
  await sealArtifactReview(stage, ["result.json"]);
  await writeFile(join(stage.root, "result.json"), "подмена");
  await assert.rejects(beginArtifactPublication(stage, ["result.json"]), /changed before publication/);
  await sealArtifactReview(stage, ["result.json"]);
  await writeFile(join(project, "input.txt"), "новый оригинал");
  await assert.rejects(beginArtifactPublication(stage, ["result.json"]), /Canonical input changed/);
});

test("Подмена проверяющего скрипта и выход из области результатов отклоняются", async () => {
  const { stage } = await fixture();
  await writeFile(join(stage.root, "input.txt"), "подмена");
  await assert.rejects(assertArtifactStage(stage, ["results/**"]), /outside allowedPaths/);
});

test("Новый файл в canonical input-каталоге блокирует публикацию старого снимка", async () => {
  const { root, project } = await fixture();
  await mkdir(join(project, 'inputs'));
  await writeFile(join(project, 'inputs', 'one.txt'), 'one');
  const stage = await prepareArtifactStage(project, join(root, 'second'), { ...contract, inputPaths: ['inputs'] });
  await sealArtifactReview(stage, ['result.json']);
  await writeFile(join(project, 'inputs', 'two.txt'), 'two');
  await assert.rejects(beginArtifactPublication(stage, ['result.json']), /inventory changed/);
});

test("Повторное использование папки и ссылки запрещены", async () => {
  const { root, project, stage } = await fixture();
  await assert.rejects(prepareArtifactStage(project, join(root, "attempt"), contract), /EEXIST/);
  const link = join(stage.root, "escape");
  await symlink(project, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(assertArtifactStage(stage, ["escape/**"]), /link/);
});

test("Контракт не допускает неявные поля, абсолютные пути и traversal", () => {
  for (const inputPaths of [["../secret"], ["C:/secret"], [".git/config"], ["a\\b"], ["a/**"], ["a", "a"]])
    assert.throws(() => validateIsolatedArtifacts({ ...contract, inputPaths }));
  assert.throws(() => validateIsolatedArtifacts({ ...contract, bypass: true }));
});
