const { test, expect } = require('@playwright/test');
require('dotenv').config();

test('Flujo End-to-End completo', async ({ page }) => {
    console.log('Iniciando prueba...');

    // Escuchar errores de consola para reportar
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error(`Error en consola: ${msg.text()}`);
        }
    });

    console.log('Navegando a la aplicación...');
    await page.goto('http://localhost:8080/index.html');

    console.log('Paso 1: Iniciando sesión...');
    const user = process.env.TEST_USER;
    const pass = process.env.TEST_PASS;
    if (!user || !pass) {
        throw new Error("Por favor, configure las variables de entorno TEST_USER y TEST_PASS antes de ejecutar las pruebas.");
    }
    await page.fill('#usuario', user);
    await page.fill('#password', pass);
    await page.click('#btn-ingreso');

    // Esperar a que desaparezca la pantalla de login
    await page.waitForSelector('#pantalla-app:not(.oculto)', { timeout: 15000 });
    console.log('Inicio de sesión exitoso. El dashboard cargó.');

    console.log('Paso 2: Verificando Dashboard...');
    const cabezas = await page.locator('#dash-cabezas').textContent();
    console.log(`- Cabezas Únicas: ${cabezas}`);
    await expect(page.locator('#dash-cabezas')).toBeVisible();

    console.log('Paso 3: Navegando a vista de Manga (Ficha)...');
    // Navegar haciendo click real en el menu inferior
    await page.locator('.nav-item').nth(1).click();
    await expect(page.locator('#vista-manga')).not.toHaveClass(/oculto/);
    console.log('- Vista Manga visible.');

    // Testear buscador
    await page.fill('#buscador-caravana', 'TEST');
    await page.click('text=Buscar');
    await page.waitForTimeout(1000);
    console.log('- Ficha de animal consultada.');

    console.log('Paso 4: Navegando a vista de Buscar (Registro)...');
    await page.locator('.nav-item').nth(2).click();
    await expect(page.locator('#vista-registro')).not.toHaveClass(/oculto/);
    console.log('- Vista de Registro visible.');

    console.log('Paso 5: Navegando a vista de Informes...');
    await page.locator('.nav-item').nth(3).click();
    await expect(page.locator('#vista-informe')).not.toHaveClass(/oculto/);

    // Cambiar modo de informe
    await page.selectOption('#f-inf-modo', 'inventario');
    await page.waitForTimeout(500);
    const totalInventario = await page.locator('#inf-total').textContent();
    console.log(`- Informe en modo Inventario, total: ${totalInventario}`);

    console.log('Paso 6: Navegando a Ajustes...');
    await page.locator('.nav-item').nth(4).click();
    await expect(page.locator('#vista-config')).not.toHaveClass(/oculto/);
    console.log('- Vista de Ajustes visible.');

    console.log('Prueba End-to-End completada con éxito.');
});