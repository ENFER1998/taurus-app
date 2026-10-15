import asyncio
from playwright.async_api import async_playwright
import json
from datetime import datetime, timedelta

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # Test Phase on Desktop
        context_desktop = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            record_video_dir="artifacts/videos"
        )
        page_desktop = await context_desktop.new_page()

        page_desktop.on("console", lambda msg: print(f"Desktop Console: {msg.text}"))
        page_desktop.on("pageerror", lambda err: print(f"Desktop Error: {err.message}"))
        page_desktop.on("dialog", lambda dialog: asyncio.create_task(dialog.accept("prompt text" if dialog.type == "prompt" else "")))

        print("Navigating to pc.html...")
        await page_desktop.goto("http://localhost:8080/pc.html")
        await page_desktop.wait_for_timeout(2000)

        # 1. Autenticación
        print("Authenticating SuperAdmin...")
        await page_desktop.fill("#usuario", "enfer.ro.98@gmail.com")
        await page_desktop.fill("#password", "enfer1998")
        await page_desktop.click("#btn-ingreso")
        await page_desktop.wait_for_timeout(4000)

        # 3. Gestión de Clientes
        print("Phase 1.3: Gestión de Clientes y Licencias (v-licencias)")
        await page_desktop.evaluate("cambiarVista('v-licencias', document.querySelectorAll('#pantalla-admin .sidebar-nav li')[1]); cargarClientes();")
        await page_desktop.wait_for_timeout(2000)

        # Edit limit
        await page_desktop.evaluate("""
            const row = Array.from(document.querySelectorAll('#tb-clientes tr')).find(tr => tr.innerText.includes('ferrodriguez441@gmail.com'));
            if(row) row.querySelector('button[onclick*="abrirEdicion"]').click();
        """)
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.evaluate("document.getElementById('modal-editar').classList.remove('oculto');")
        await page_desktop.evaluate("document.getElementById('modal-editar').style.display = 'flex';")
        await page_desktop.wait_for_timeout(500)
        await page_desktop.fill("#e-limite-ops", "10", force=True)
        await page_desktop.fill("#e-limite-own", "2", force=True)
        await page_desktop.evaluate("guardarEdicion()")
        await page_desktop.wait_for_timeout(2000)

        # Renovar
        new_date = (datetime.now() + timedelta(days=60)).strftime('%Y-%m-%d')
        await page_desktop.evaluate(f"""
            const row = Array.from(document.querySelectorAll('#tb-clientes tr')).find(tr => tr.innerText.includes('ferrodriguez441@gmail.com'));
            if(row) {{
                const input = row.querySelector('input[type="date"]');
                input.value = '{new_date}';
                row.querySelector('button[onclick*="actualizarVencimiento"]').click();
            }}
        """)
        await page_desktop.wait_for_timeout(2000)

        # Ver equipo
        await page_desktop.evaluate("""
            const row = Array.from(document.querySelectorAll('#tb-clientes tr')).find(tr => tr.innerText.includes('ferrodriguez441@gmail.com'));
            if(row) row.querySelector('button[onclick*="verEquipo"]').click();
        """)
        await page_desktop.wait_for_timeout(2000)
        await page_desktop.screenshot(path="artifacts/screenshots/F1_03_ver_equipo.png")
        await page_desktop.evaluate("cerrarModal('modal-equipo')")
        await page_desktop.wait_for_timeout(1000)

        # 4. Importación Masiva Inteligente de Rodeo
        print("Phase 1.4: Importación Masiva")
        await page_desktop.evaluate("cambiarVista('v-masiva', document.querySelectorAll('#pantalla-admin .sidebar-nav li')[2]); cargarClientesMasiva();")
        await page_desktop.wait_for_timeout(2000)

        # Create CSV
        csv_content = "Caravana,Categoria,Peso,Fecha,Lote,Raza\nJULES-01,Novillo,385.5,2026-09-01,Invernada A,Nelore\nJULES-02,Vaca,420.0,2026-09-01,Cría General,Brangus\nJULES-03,Ternero,160.0,2026-09-01,Destete,Braford"
        with open("artifacts/import_data.csv", "w") as f:
            f.write(csv_content)

        await page_desktop.select_option("#sel-cliente-masiva", value="ferrodriguez441@gmail.com", force=True)
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.set_input_files("#archivo-excel", "artifacts/import_data.csv")
        await page_desktop.wait_for_timeout(2000)
        await page_desktop.evaluate("leerArchivoInteligente()")
        await page_desktop.wait_for_timeout(2000)

        await page_desktop.select_option("#map-caravana", label="Caravana", force=True)
        await page_desktop.select_option("#map-categoria", label="Categoria", force=True)
        await page_desktop.select_option("#map-peso", label="Peso", force=True)
        await page_desktop.select_option("#map-fecha", label="Fecha", force=True)
        await page_desktop.select_option("#map-lote", label="Lote", force=True)
        await page_desktop.select_option("#map-raza", label="Raza", force=True)

        await page_desktop.evaluate("procesarMapeoEInyectar()")
        await page_desktop.wait_for_timeout(4000)
        await page_desktop.screenshot(path="artifacts/screenshots/F1_04_carga_masiva_exitosa.png")

        print("Phase 1.5: Edición Masiva y Purgas en Firestore (v-editar-masiva)")
        await page_desktop.evaluate("cambiarVista('v-editar-masiva', document.querySelectorAll('#pantalla-admin .sidebar-nav li')[3]); inicializarModuloEditarMasiva();")
        await page_desktop.wait_for_timeout(1000)

        await page_desktop.select_option("#sel-hacienda-editar", value="ferrodriguez441@gmail.com", force=True)
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.evaluate("cargarEventosCargaMasiva()")
        await page_desktop.wait_for_timeout(3000)

        # find JULES-01 and edit
        await page_desktop.evaluate("""
            const row = Array.from(document.querySelectorAll('#tb-eventos-masivos tr')).find(tr => tr.innerText.includes('JULES-01'));
            if(row) row.querySelector('button[onclick*="abrirModalEditarEvento"]').click();
        """)
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.evaluate("document.getElementById('modal-editar-evento').style.display = 'flex';")
        await page_desktop.wait_for_timeout(500)

        await page_desktop.fill("#edit-ev-valor", "390.0", force=True)
        await page_desktop.fill("#edit-ev-detalles", "Modificado por Jules QA", force=True)
        await page_desktop.evaluate("guardarEdicionEventoFirestore()")
        await page_desktop.wait_for_timeout(2000)

        await page_desktop.fill("#fecha-cambio-masivo", "2026-09-05T00:00", force=True)
        await page_desktop.evaluate("cambiarFechaMasivaLote()")
        await page_desktop.wait_for_timeout(3000)

        print("Phase 1.6: Control Global del Sistema y Kill Switch (v-config)")
        await page_desktop.evaluate("cambiarVista('v-config', document.querySelectorAll('#pantalla-admin .sidebar-nav li')[4]); checkStatusInicial();")
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.fill("#txt-aviso-mant", "⚠️ MANTENIMIENTO PROGRAMADO EN 30 MINUTOS", force=True)
        await page_desktop.evaluate("enviarAvisoMantenimiento()")
        await page_desktop.wait_for_timeout(2000)
        await page_desktop.evaluate("toggleMantenimiento('ON')")
        await page_desktop.wait_for_timeout(2000)
        await page_desktop.evaluate("toggleMantenimiento('OFF')")
        await page_desktop.wait_for_timeout(2000)

        print("--- PHASE 2 ---")
        await page_desktop.evaluate("cerrarSesion()")
        await page_desktop.wait_for_timeout(2000)

        print("Authenticating Propietario Ganadero...")
        await page_desktop.fill("#usuario", "ferrodriguez441@gmail.com")
        await page_desktop.fill("#password", "123456")
        await page_desktop.click("#btn-ingreso")
        await page_desktop.wait_for_timeout(5000)
        await page_desktop.screenshot(path="artifacts/screenshots/F2_01_dashboard_completo.png")

        print("Phase 2.2: Personalización del Dashboard")
        await page_desktop.evaluate("cambiarVista('v-config', document.querySelectorAll('#sidebar .sidebar-nav li')[4])")
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.evaluate("""
            const checkboxes = document.querySelectorAll('.chk-graf');
            if (checkboxes.length > 2) {
                checkboxes[0].checked = false;
                checkboxes[1].checked = false;
            }
            if (typeof verificarLimiteGraficos === 'function') verificarLimiteGraficos(checkboxes[0]);
        """)
        await page_desktop.wait_for_timeout(2000)
        await page_desktop.evaluate("cambiarVista('v-dash', document.querySelectorAll('#sidebar .sidebar-nav li')[0]); if (typeof procesarDatosDashboard === 'function') procesarDatosDashboard();")
        await page_desktop.wait_for_timeout(2000)

        print("Phase 2.3: Manga / Brete")
        await page_desktop.evaluate("cambiarVista('v-ficha', document.querySelectorAll('#sidebar .sidebar-nav li')[1])")
        await page_desktop.wait_for_timeout(1000)

        await page_desktop.fill("#buscador-caravana", "JULES-01", force=True)
        await page_desktop.evaluate("buscarCaravanaBtn()")
        await page_desktop.wait_for_timeout(2000)
        await page_desktop.evaluate("document.getElementById('modal-peso').style.display = 'flex';")
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.fill("#i-peso-val", "435.0", force=True)
        await page_desktop.select_option("#i-peso-cond", label="CC 3.5 (Buena Cobertura)", force=True)
        await page_desktop.fill("#i-peso-txt", "Control mensual brete", force=True)
        await page_desktop.evaluate("prepararGuardado('modal-peso', 'Peso')")
        await page_desktop.wait_for_timeout(2000)

        # 4. Creación de Operador / Peón de Campo
        print("Phase 2.4: Creación de Operador")
        await page_desktop.evaluate("cambiarVista('v-config', document.querySelectorAll('#sidebar .sidebar-nav li')[4])")
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.fill("#op-nombre", "Peon Jules QA", force=True)
        await page_desktop.fill("#op-usu", "peon_jules", force=True)
        await page_desktop.fill("#op-pass", "123456", force=True)
        await page_desktop.evaluate("""
            const chk = document.querySelectorAll('.chk-permiso');
            if (chk.length >= 4) {
                chk[0].checked = false; // Dashboard
                chk[1].checked = true;  // Manga
                chk[2].checked = true;  // Registro
                chk[3].checked = false; // Informes
            }
        """)
        await page_desktop.evaluate("crearOperador()")
        await page_desktop.wait_for_timeout(4000)
        await page_desktop.screenshot(path="artifacts/screenshots/F2_03_operador_creado.png")

        # Phase 4: Auditoría del Centro de Informes
        print("Phase 4: Centro de Informes")
        await page_desktop.evaluate("cambiarVista('v-reporte', document.querySelectorAll('#sidebar .sidebar-nav li')[3]); actualizarInformeAvanzado();")
        await page_desktop.wait_for_timeout(1000)

        try:
            await page_desktop.evaluate("""
                const sel = document.getElementById('f-inf-modo');
                if(sel) { sel.value = "pesajes"; sel.dispatchEvent(new Event('change')); }
            """)
            await page_desktop.wait_for_timeout(1000)
            await page_desktop.evaluate("ejecutarDescargaPDF()")
            await page_desktop.wait_for_timeout(3000)
        except Exception as e:
            print("Error downloading reports: " + str(e))

        await page_desktop.evaluate("cambiarVista('v-ficha', document.querySelectorAll('#sidebar .sidebar-nav li')[1])")
        await page_desktop.wait_for_timeout(1000)
        await page_desktop.fill("#buscador-caravana", "JULES-01", force=True)
        await page_desktop.evaluate("buscarCaravanaBtn()")
        await page_desktop.wait_for_timeout(2000)
        await page_desktop.evaluate("imprimirDossierDirecto()")
        await page_desktop.wait_for_timeout(4000)


        # MOBILE CONTEXT
        context_mobile = await browser.new_context(
            viewport={'width': 390, 'height': 844}, # iPhone 13/14
            record_video_dir="artifacts/videos"
        )
        page_mobile = await context_mobile.new_page()

        page_mobile.on("console", lambda msg: print(f"Mobile Console: {msg.text}"))
        page_mobile.on("pageerror", lambda err: print(f"Mobile Error: {err.message}"))

        print("\n\nNavigating to index.html (Mobile)...")
        await page_mobile.goto("http://localhost:8080/index.html")
        await page_mobile.wait_for_timeout(2000)

        print("Authenticating Propietario Ganadero on Mobile...")
        await page_mobile.fill("#usuario", "ferrodriguez441@gmail.com")
        await page_mobile.fill("#password", "123456")
        await page_mobile.click("#btn-ingreso")
        await page_mobile.wait_for_timeout(5000)

        print("Phase 2.3: Manga / Brete on Mobile")
        await page_mobile.evaluate("cambiarVista('vista-manga', document.querySelectorAll('.nav-item')[1])")
        await page_mobile.wait_for_timeout(1000)

        await page_mobile.fill("#buscador-caravana", "JULES-01", force=True)
        await page_mobile.evaluate("buscarCaravanaBtn()")
        await page_mobile.wait_for_timeout(2000)

        # modal-peso on mobile
        await page_mobile.evaluate("document.getElementById('modal-peso').style.display = 'block';")
        await page_mobile.wait_for_timeout(1000)
        await page_mobile.fill("#i-peso-val", "435.0", force=True)
        await page_mobile.select_option("#i-peso-cond", label="CC 3.5 (Buena Cobertura)", force=True)
        await page_mobile.fill("#i-peso-txt", "Control mensual brete", force=True)
        await page_mobile.evaluate("prepararGuardado('modal-peso', 'Peso')")
        await page_mobile.wait_for_timeout(2000)

        print("Auditoria finalizada con éxito!")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
