import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.resolve(rootDir, 'dist')

async function buildSite() {
  console.log('Building site...')

  // 1. Clean dist
  if (existsSync(distDir)) {
    await fs.rm(distDir, { recursive: true })
  }
  await fs.mkdir(distDir, { recursive: true })

  // 2. Find all slide folders
  const folders = (await fs.readdir(rootDir, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(folder => folder.match(/^\d{4}-/)) // Match YYYY-MM-DD or similar
    .sort((a, b) => -a.localeCompare(b)) // Newest first

  const slidesInfo = []

  // 3. Build each slide
  for (const folder of folders) {
    console.log(`\nBuilding ${folder}...`)
    const slideDir = path.join(rootDir, folder, 'src')
    const slideDistDir = path.join(distDir, folder)

    if (!existsSync(path.join(slideDir, 'slides.md'))) {
      console.warn(`Skipping ${folder}: slides.md not found`)
      continue
    }

    // Read title from slides.md
    let title = folder
    try {
      const content = await fs.readFile(path.join(slideDir, 'slides.md'), 'utf-8')
      const match = content.match(/^title:\s*(.+)$/m)
      if (match) {
        title = match[1].trim()
      }
    } catch (e) {
      console.warn(`Could not read title for ${folder}`)
    }

    slidesInfo.push({ folder, title })

    // Build using slidev CLI directly to control output and base
    // We assume 'pnpm' is available and dependencies are installed
    try {
      await execa('pnpm', ['exec', 'slidev', 'build', '--base', `/${folder}/`, '--out', slideDistDir], {
        cwd: slideDir,
        stdio: 'inherit',
      })
    } catch (e) {
      console.error(`Failed to build ${folder}:`, e)
      // Continue building other slides? Or fail?
      // Let's fail for now to ensure CI catches errors
      process.exit(1)
    }
  }

  // 4. Generate Index Page
  console.log('\nGenerating index page...')
  const templatePath = path.resolve(__dirname, 'index.template.html')
  const cssPath = path.resolve(__dirname, 'index.css')
  
  let indexHtml = await fs.readFile(templatePath, 'utf-8')
  const cssContent = await fs.readFile(cssPath, 'utf-8')

  const slidesListHtml = slidesInfo.map(info => `
      <div class="slide-item">
        <a href="/${info.folder}/" class="slide-link">
          <div class="slide-title">${info.title}</div>
          <div class="slide-date">${info.folder}</div>
        </a>
      </div>
    `).join('')

  indexHtml = indexHtml
    .replace('<!-- INJECT_SLIDES_LIST -->', slidesListHtml)
    .replace('/* INJECT_CSS */', cssContent)

  await fs.writeFile(path.join(distDir, 'index.html'), indexHtml)
  console.log('Build complete! Output directory: dist/')
}

buildSite().catch(err => {
  console.error(err)
  process.exit(1)
})

