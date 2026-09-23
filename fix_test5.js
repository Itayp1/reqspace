const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

const oldEnvSection = `    // Click Manage Environments button (gear icon in TopBar)
    await page.locator('button:has-text("Envs")').click();
    
    // Create new environment
    await page.getByTitle('Create Environment').click();
    await page.fill('input[placeholder="Environment Name"]', \`Test Env \${suffix}\`);
    // Add variable
    // Wait for the environment to be active in the modal
    await expect(page.locator('.bg-surface:has-text("Variables")')).toBeVisible();
    await page.fill('input[placeholder="Key"]', 'BASE_URL');
    await page.fill('input[placeholder="Value"]', 'https://jsonplaceholder.typicode.com');
    // Save environment
    await page.locator('button:has-text("Save")').first().click();
    
    // Close modal
    await page.locator('button > svg.lucide-x').first().click();
    
    // Select the new environment in the top dropdown
    const envSelect = page.locator('select').nth(1);
    await envSelect.selectOption({ label: \`Test Env \${suffix}\` });`;

const newEnvSection = `    // 9. Environment variables
    await page.locator('button:has-text("Envs")').click();
    
    // Handle native prompt for environment name
    page.once('dialog', dialog => dialog.accept(\`Test Env \${suffix}\`));
    await page.getByTitle('New Environment').click();
    
    // Click the new environment in the sidebar to open it in a tab
    await page.locator(\`text=Test Env \${suffix}\`).first().click();
    
    // Wait for the environment tab to be active
    await expect(page.locator('.font-bold:has-text("Variables")')).toBeVisible();
    
    // Add variable
    const keyInput = page.locator('input[placeholder="Key"]').first();
    await expect(keyInput).toBeVisible();
    await keyInput.fill('BASE_URL');
    
    const valueInput = page.locator('input[placeholder="Value"]').first();
    await valueInput.fill('https://jsonplaceholder.typicode.com');
    
    // Select the new environment in the top dropdown
    // Wait, the dropdown is in the TopBar. We can find it by its text or placeholder.
    // In TopBar, it's a select element
    const envSelect = page.locator('select').nth(0);
    await envSelect.selectOption({ label: \`Test Env \${suffix}\` });`;

code = code.replace(/    \/\/ Click Manage Environments button \(gear icon in TopBar\)[\s\S]*?await envSelect\.selectOption\(\{ label: `Test Env \$\{suffix\}` \}\);/, newEnvSection);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
