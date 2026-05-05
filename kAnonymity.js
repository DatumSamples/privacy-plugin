// Global variables to track state
let currentKAnonymityDataset = null;
let currentQuasiIdentifiers = [];
let kValue = 2;

// Dataset attributes mapping for K-Anonymity Try It Out Module
const datasetAttributesKAnonymity = {
    'employee_anonymity': ['Age', 'City', 'MaritalStatus', 'Profession', 'Income'],
    'bank_anonymity': ['Age', 'Education', 'JobType', 'Region', 'Balance'],
    'healthcare_anonymity': ['Age', 'Condition', 'Insurance', 'Region', 'Cost'],
};


// Function to handle dataset selection change for K-Anonymity
async function handleKAnonymityDatasetChange() {
    const datasetSelect = document.getElementById('datasetSelectKAnonymity');
    const newDataset = datasetSelect.value;

    if (!newDataset) {
        alert("Please select a dataset.");
        return;
    }

    // Hide previous dataset table if needed
    if (currentKAnonymityDataset && currentKAnonymityDataset !== newDataset) {
        await toggleTable(currentKAnonymityDataset, false);
    }

    currentKAnonymityDataset = newDataset;
    console.log(`Dataset Selected: ${currentKAnonymityDataset}`);

    // Load only if not already loaded
    const isDataLoaded = await checkIfDataLoaded(currentKAnonymityDataset);
    if (!isDataLoaded) {
        try {
            await loadCSVDataFromFolder('k_anonymity', 'try', currentKAnonymityDataset + '.csv');
        } catch (error) {
            console.error(`Failed to load dataset: ${currentKAnonymityDataset}`, error);
            alert("Error loading dataset.");
            return;
        }
    }

    await toggleTable(currentKAnonymityDataset, true);

    // Populate QI checkboxes
    populateQuasiIdentifierCheckboxes(currentKAnonymityDataset);

    // Show the UI elements
    document.getElementById('variableSelectionKAnonymity').style.display = 'block';
    document.getElementById('parameterControlsKAnonymity').style.display = 'block';
}


// Function to populate checkboxes based on dataset columns
function populateQuasiIdentifierCheckboxes(dataset) {
    const container = document.getElementById("quasiIdentifierCheckboxes");
    container.innerHTML = ""; // Clear previous checkboxes

    if (!datasetAttributesKAnonymity[dataset]) {
        console.warn(`No attributes found for dataset: ${dataset}`);
        return;
    }

    datasetAttributesKAnonymity[dataset].forEach(attr => {
        let div = document.createElement("div");
        div.classList.add("form-check");

        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.classList.add("form-check-input");
        checkbox.value = attr;
        checkbox.id = `qi_${attr}`;

        let label = document.createElement("label");
        label.classList.add("form-check-label");
        label.htmlFor = `qi_${attr}`;
        label.textContent = attr;

        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
    });
}

// Function to update the K value dynamically
function updateKValue(valueID, newValue) {
    document.getElementById(valueID).textContent = newValue;
    kValue = parseInt(newValue);
}

// Function to apply K-Anonymity to the dataset
async function applyKAnonymity() {
    if (!currentKAnonymityDataset) {
        alert("Please select a dataset.");
        return;
    }

    // Step 1: Get selected QIs
    const selectedCheckBoxes = document.querySelectorAll("#quasiIdentifierCheckboxes input:checked");
    currentQuasiIdentifiers = Array.from(selectedCheckBoxes).map(cb => cb.value);

    if (currentQuasiIdentifiers.length == 0) {
        alert("Please select at least one quasi-identifier.");
        return;
    }

    // Step 2: Get dataset rows
    const cases = await getAllCases(currentKAnonymityDataset);

    // Step 3: Count groups based on selected QIs
    const groupCounts = {};
    cases.forEach(item => {
        const groupKey = currentQuasiIdentifiers.map(qi => item.case.values[qi] ?? "MISSING").join('|');
        groupCounts[groupKey] = (groupCounts[groupKey] || 0) + 1;
    });

    // Step 4: Create updated case list
    const updatedCases = cases.map(item => {
        const groupKey = currentQuasiIdentifiers.map(qi => item.case.values[qi]).join('|');
        const isKAnonymous = groupCounts[groupKey] >= kValue ? "✅" : "❌";
        return {
            id: item.case.id,
            values: { "K-Anonymity Check": isKAnonymous }
        };
    });

    // Optional: ensure the column exists in CODAP
    await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${currentKAnonymityDataset}].collection[cases].attribute`,
        values: {
            name: "K-Anonymity Check",
            type: "categorical",
            description: "Shows if the record satisfies K-Anonymity"
        }
    });

    // Step 5: Push updated column into CODAP
    const response = await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${currentKAnonymityDataset}].collection[cases].case`,
        values: updatedCases,
    });

    // Step 6: Update UI
    if (response.success) {
        document.getElementById("resultsSectionKAnonymity").style.display = "block";
        document.getElementById("datasetPreviewTable").innerHTML =
            `<div class="alert alert-success">K-Anonymity Check Applied ✅ = Satisfied, ❌ = Not Satisfied</div>`;
    } else {
        alert("Error applying K-Anonymity.");
    }
}

// Function to reset K-Anonymity settings
async function resetKAnonymity() {
    if (!currentKAnonymityDataset) return;

    try {
        await codapInterface.sendRequest({
            action: 'delete',
            resource: `dataContext[${currentKAnonymityDataset}].collection[cases].attribute[K-Anonymity Check]`
        });

        // Reset UI elements
        document.getElementById('kSliderTryOut').value = 2;
        document.getElementById('kValueTryOut').textContent = "2";
        document.getElementById('resultsSectionKAnonymity').innerHTML =
            '<div class="alert alert-info">Reset successful</div>';

    } catch (error) {
        console.error('Error resetting K-Anonymity:', error);
        document.getElementById('resultsSectionKAnonymity').innerHTML =
            '<div class="alert alert-danger">Error resetting: ' + error.message + '</div>';
    }
}

// Function to allow data context to initialize (Helper function for loadCSVData)
async function waitForDataContext(dataContextName, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const response = await codapInterface.sendRequest({
            action: 'get',
            resource: `dataContext[${dataContextName}]`
        });
        
        if (response.success) {
            console.log(`Data context ${dataContextName} initialized.`);
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 500ms before checking again
    }
    return false;
}

// Function to retrieve all dataset cases
async function getAllCases(dataContext) {
    const response = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${dataContext}].collection[cases].allCases`
    });

    return response.success ? response.values.cases : [];
}

// Function to handle going back frm Try It Our module
async function TryItOutBack() {
    console.log("Returning to K-Anonymity Main Screen...");

    // Check if a dataset is selected
    if (currentKAnonymityDataset) {
        try {
            console.log(`Resetting dataset: ${currentKAnonymityDataset}`);

            // Reset dataset modifications
            await resetKAnonymity();

            // Hide dataset table in CODAP
            await toggleTable(currentKAnonymityDataset, false);
        } catch (error) {
            console.error("Error cleaning up Try It Out module:", error);
        }
    }

    // Reset UI elements
    document.getElementById("datasetSelectKAnonymity").value = "";
    document.getElementById("variableSelectionKAnonymity").style.display = "none";
    document.getElementById("parameterControlsKAnonymity").style.display = "none";
    document.getElementById("resultsSectionKAnonymity").style.display = "none";

    // Reset state variables
    currentKAnonymityDataset = null;
    currentQuasiIdentifiers = [];
    kValue = 2;

    // Reset K Slider UI
    document.getElementById("kSliderTryOut").value = 2;
    document.getElementById("kValueTryOut").textContent = "2";

    // Return to main screen
    await showModule("kAnonymityMainScreen");
}

// Function to load a CSV file from a URL inside data folder
async function loadCSVDataFromFolder(privacyRule, datasetFolder, datasetName) {
    const csvURL = window.location.href.replace(/\/[^\/]*$/, "") + `/data/${privacyRule}/${datasetFolder}/${datasetName}`;
    const dataContextName = datasetName.split('.csv')[0];

    try {
        const response = await codapInterface.sendRequest({
            action: 'create',
            resource: 'dataContextFromURL',
            values: {
                URL: csvURL            }
        });

        if (response.success) {
            console.log(`${dataContextName} CSV data loaded successfully.`);

            // Wait for data context to initialize
            const contextInitialized = await waitForDataContext(dataContextName);
            if (!contextInitialized) {
                throw new Error(`Data context ${dataContextName} failed to initialize`);
            }
            return true;
        } else {
            throw new Error(`Failed to load ${dataContextName} CSV data`);
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// Function to toggle the visibility of the case table in CODAP
async function toggleTable(dataContext, visibility) {
    const tableID = await getTableID(dataContext);
    if (tableID) {
        await codapInterface.sendRequest({
            action: 'update',
            resource: `component[${tableID}]`,
            values: {
                isVisible: visibility
            }
        });
    }
}

// Function to get case table ID from CODAP
async function getTableID(dataContext) {
    const response = await codapInterface.sendRequest({
        action: 'get',
        resource: 'componentList'
    });
    
    if (response.success) {
        const component = response.values.find(comp => 
            comp.type === 'caseTable' && 
            comp.title === dataContext
        );
        return component ? component.id : null;
    }
    return null;
}
