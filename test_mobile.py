import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()

        page.on("console", lambda msg: print(f"Mobile Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Mobile Error: {err.message}"))

        print("Navigating to index.html...")
        await page.goto("http://localhost:8080/index.html")
        await page.wait_for_timeout(2000)

        print("Authenticating in mobile...")
        await page.fill("#usuario", "ferrodriguez441@gmail.com")
        await page.fill("#password", "123456")
        await page.click("#btn-ingreso")
        await page.wait_for_timeout(4000)

        # Test Manga events (Peso, Tacto, Ins, Sanidad)
        await page.evaluate("cambiarVista('vista-manga', document.querySelectorAll('.nav-item')[1])")
        await page.wait_for_timeout(1000)

        await page.fill("#buscador-caravana", "JULES-01", force=True)
        await page.evaluate("buscarCaravanaBtn()")
        await page.wait_for_timeout(2000)

        # modal-peso
        await page.evaluate("document.getElementById('modal-peso').style.display = 'flex';")
        await page.wait_for_timeout(1000)
        await page.fill("#i-peso-val", "435.0", force=True)
        await page.select_option("#i-peso-cond", label="CC 3.5 (Buena Cobertura)", force=True)
        await page.fill("#i-peso-txt", "Control mensual brete", force=True)
        await page.evaluate("prepararGuardado('modal-peso', 'Peso')")
        await page.wait_for_timeout(2000)

        # modal-diagnostico
        await page.evaluate("document.getElementById('modal-diagnostico').style.display = 'flex';")
        await page.wait_for_timeout(1000)
        await page.select_option("#i-dx-sel", value="Preñada", force=True)
        await page.select_option("#i-dx-meses", value="3", force=True)
        await page.evaluate("prepararGuardado('modal-diagnostico', 'Diagnóstico')")
        await page.wait_for_timeout(2000)

        # modal-inseminacion
        await page.evaluate("document.getElementById('modal-inseminacion').style.display = 'flex';")
        await page.wait_for_timeout(1000)
        await page.fill("#i-ins-toro", "TORO-DON-PEDRO - PAJ-9821", force=True)
        await page.select_option("#i-ins-quien", value="IATF", force=True)
        await page.fill("#i-ins-txt", "Inseminador: Dr. González", force=True)
        await page.evaluate("prepararGuardado('modal-inseminacion', 'Inseminación')")
        await page.wait_for_timeout(2000)

        print("Mobile tests successful")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
