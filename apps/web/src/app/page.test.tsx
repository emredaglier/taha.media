import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import RootLayout from './layout'
import HomePage from './page'

test('the home page is an empty Turkish page shell', () => {
  const html = renderToStaticMarkup(
    <RootLayout>
      <HomePage />
    </RootLayout>,
  )
  expect(html).toContain('<html lang="tr">')
  expect(html).toContain('<body><main></main></body>')
})
