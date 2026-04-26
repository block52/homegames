import inquirer from "inquirer";

export async function askPassphrase(message = "Enter your passphrase:"): Promise<string> {
    const answers = await inquirer.prompt([
        {
            type: "password",
            name: "passphrase",
            message,
            mask: "*",
            validate: (input: string) => input.length > 0 || "Passphrase is required"
        }
    ]);
    return answers.passphrase;
}

export async function askNewPassphrase(): Promise<string> {
    const answers = await inquirer.prompt([
        {
            type: "password",
            name: "passphrase",
            message: "Enter a passphrase to protect your key:",
            mask: "*",
            validate: (input: string) => input.length >= 8 || "Passphrase must be at least 8 characters"
        },
        {
            type: "password",
            name: "confirmPassphrase",
            message: "Confirm your passphrase:",
            mask: "*",
            validate: (input: string, answers: { passphrase?: string } | undefined) =>
                input === answers?.passphrase || "Passphrases do not match"
        }
    ]);
    return answers.passphrase;
}

export async function confirm(message: string, defaultValue = false): Promise<boolean> {
    const answers = await inquirer.prompt([
        {
            type: "confirm",
            name: "confirmed",
            message,
            default: defaultValue
        }
    ]);
    return answers.confirmed;
}

export async function selectTrustLevel(): Promise<1 | 2 | 3> {
    const answers = await inquirer.prompt([
        {
            type: "list",
            name: "level",
            message: "Select trust level:",
            choices: [
                { name: "1 - Met online (lowest trust)", value: 1 },
                { name: "2 - Met in person", value: 2 },
                { name: "3 - Long-term trust (highest trust)", value: 3 }
            ]
        }
    ]);
    return answers.level;
}

export async function askOptionalNote(): Promise<string | undefined> {
    const answers = await inquirer.prompt([
        {
            type: "input",
            name: "note",
            message: "Add an optional note (press Enter to skip):"
        }
    ]);
    return answers.note || undefined;
}
