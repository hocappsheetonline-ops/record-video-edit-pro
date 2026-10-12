import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { createFixtureProject } from './fixtures'
import { createTestDirs, launchApp, type TestDirs } from './helpers'

test.describe.configure({ timeout: 180_000 })

let alice: TestDirs
let bob: TestDirs
test.beforeEach(() => {
  alice = createTestDirs()
  bob = createTestDirs()
})
test.afterEach(() => {
  alice.cleanup()
  bob.cleanup()
})

/** Thay hộp thoại lưu/mở file của Windows bằng đường dẫn định sẵn (không bấm được hộp thoại thật). */
async function stubDialogs(app: ElectronApplication, file: string) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as never
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, file)
}

test('chia sẻ dự án: gửi gói đầy đủ, người nhận chỉnh sửa rồi gửi lại bản chỉnh sửa', async () => {
  const projectDir = createFixtureProject(alice.projects)
  const fullPack = join(alice.userData, 'demo.lumorapack')
  const editsPack = join(bob.userData, 'demo-edits.lumorapack')

  // Alice gửi gói đầy đủ.
  let { app, page, errors } = await launchApp(alice.userData)
  await stubDialogs(app, fullPack)
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('share-open').click()
  await page.getByTestId('share-full').click()
  await expect(page.getByTestId('share-result')).toContainText('demo.lumorapack')
  expect(statSync(fullPack).size).toBeGreaterThan(50_000)
  expect(errors).toEqual([])
  await app.close()

  // Bob nhập gói, mở ra chỉnh sửa (đổi tỉ lệ 9:16) rồi gửi lại bản chỉnh sửa.
  ;({ app, page, errors } = await launchApp(bob.userData))
  await stubDialogs(app, fullPack)
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('import-pack').click()
  await expect(page.getByTestId('project-name')).toBeVisible()
  // Bob có đúng một dự án mới (tên thư mục theo tên dự án).
  const bobFolders = readdirSync(bob.projects)
  expect(bobFolders).toHaveLength(1)
  const bobFolder = bobFolders[0]!
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('editor')).toBeVisible()
  await page.getByTestId('tab-frame').click()
  await page.getByTestId('preset-vertical').click()
  await expect
    .poll(() => {
      try {
        return JSON.parse(readFileSync(join(bob.projects, bobFolder, 'edit.json'), 'utf8')).frame
          .aspect
      } catch {
        return null
      }
    })
    .toBe('9:16')
  await stubDialogs(app, editsPack)
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('project-card').click()
  await page.getByTestId('share-open').click()
  await page.getByTestId('share-edits').click()
  await expect(page.getByTestId('share-result')).toBeVisible()
  expect(statSync(editsPack).size).toBeLessThan(50_000)
  expect(errors).toEqual([])
  await app.close()

  // Alice nhập bản chỉnh sửa của Bob: dự án của cô được cập nhật.
  ;({ app, page, errors } = await launchApp(alice.userData))
  await stubDialogs(app, editsPack)
  await page.getByTestId('nav-projects').click()
  await page.getByTestId('import-pack').click()
  await expect(page.getByTestId('import-result')).toContainText('Đã cập nhật bản chỉnh sửa')
  const aliceEdit = JSON.parse(readFileSync(join(projectDir, 'edit.json'), 'utf8'))
  expect(aliceEdit.frame).toMatchObject({ aspect: '9:16', fill: true })
  await page.getByTestId('project-card').click()
  await page.getByTestId('open-editor').click()
  await expect(page.getByTestId('frame-fill')).toBeChecked()
  expect(errors).toEqual([])
  await app.close()
})
