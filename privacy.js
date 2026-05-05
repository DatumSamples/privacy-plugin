// Function to start the CODAP connection
async function startCodapConnection() {
    var config = {
        title: 'Privacy Rules Plugin',
        version: '0.1',
        dimensions: {width: 800, height: 800}
    };
    await codapInterface.init(config);
    console.log('CODAP connection established.');
}

// Function to load a CSV file from a URL
async function loadCSVData(datasetName) {
    const csvURL = `https://raw.githubusercontent.com/Ruze-alt/privacy/refs/heads/main/data/${datasetName}`;
    const dataContextName = datasetName.split('.csv')[0];

    try {
        const response = await codapInterface.sendRequest({
            action: 'create',
            resource: 'dataContextFromURL',
            values: {
                URL: csvURL
            }
        });

        if (response.success) {
            console.log('CSV data loaded successfully.');

            // Wait for data context to initialize
            const contextInitialized = await waitForDataContext(dataContextName);
            if (!contextInitialized) {
                throw new Error(`Data context ${dataContextName} failed to initialize`);
            }
            return true;
        } else {
            throw new Error('Failed to load CSV data');
        } 
    } catch (error) {
        console.error(error);
        throw error;
    }
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
                URL: csvURL
            }
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

async function deleteDataContext(datasetName) {
    const response = await codapInterface.sendRequest({
        action: 'delete',
        resource: `dataContext[${datasetName}]`
    });
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

// Function to check if a dataset is loaded
async function checkIfDataLoaded(dataContextName) {
    const response = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${dataContextName}]`
    });
    
    if (response.success) {
        return true;
    } else {
        return false;
    }
}

// Function to show a module
async function showModule(moduleID) {
    const modules = document.querySelectorAll('.privacyModule, #main');
    modules.forEach(module => module.style.display = 'none');
    document.getElementById(moduleID).style.display = 'block';
}

// Function to update the epsilon value
function updateEpsilon(valueID, epsilonValue) {
    document.getElementById(valueID).textContent = parseFloat(epsilonValue).toFixed(1);
}

// Function to update the sensitivity value
function updateSensitivity(valueID, sensitivityValue) {
    document.getElementById(valueID).textContent = parseFloat(sensitivityValue).toFixed(1);
}

// Function to get all cases 
async function getAllCases(dataContext) {
    const response = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${dataContext}].collection[cases].allCases`
    });
    
    if (response.success) {
        return response.values.cases;
    } else {
        console.error('Failed to retrieve cases.');
        return [];
    }
}

// Function to get Categorical Features (Unique Categories and All Cases)
async function getCategoricalFeatures(categoricalAttribute, dataContext) {
    const response = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${dataContext}].collection[cases].caseFormulaSearch[\'${categoricalAttribute}\']`
    });
    
    if (response.success) {
        const allCases = response.values.map(item => item.values[categoricalAttribute]);
        const uniqueCategories = [...new Set(allCases)];
        return [allCases, uniqueCategories];
    } else {
        console.error(`Failed to retrieve ${categoricalAttribute} data.`);
        return [[], []];
    }
}

// Function to open a numerical graph in CODAP
async function openGraph(title, xAttributeName, yAttributeName, dataContext, name="NumericalGraph") {
    const NumericalGraphConfig = {
        type: 'graph',
        name: name,
        title: title,
        dimensions: {width: 400, height: 400},
        xAttributeName: xAttributeName,
        yAttributeName: yAttributeName,
        dataContext: dataContext
    };
    
    const response = await codapInterface.sendRequest({
        action: 'create',
        resource: 'component',
        values: NumericalGraphConfig
    });
    
    if (response.success) {
        console.log('Differential Privacy graph created successfully.');
    } else {
        console.error('Failed to create Differential Privacy graph.');
    }
}

// Function to open a categorical graph displaying it's distribution in CODAP with sorted categories
async function openCategoricalGraph(categoricalAttribute, sortedCategories, dataContext) {
    const CategoricalGraphConfig = {
        type: 'graph',
        name: 'DistributionGraph',
        title: `${categoricalAttribute} Distribution`,
        dimensions: {width: 400, height: 300},
        xAttributeName: categoricalAttribute,
        dataContext: dataContext,
        xAxisCategories: sortedCategories
    };
    
    const response = await codapInterface.sendRequest({
        action: 'create',
        resource: 'component',
        values: CategoricalGraphConfig
    });
    
    if (response.success) {
        console.log(`${categoricalAttribute} Distribution graph created successfully.`);
    } else {
        console.error(`Failed to create ${categoricalAttribute} Distribution graph.`);
    }
}

// Function to close graphs in CODAP
async function closeGraph(graphName) {
    await codapInterface.sendRequest({
        action: 'delete',
        resource: `component[${graphName}]`
    }).catch(() => {});
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


// Function delete an attribute from a data table in CODAP
async function deleteAttribute(attributeName, dataContext) {
    const response = await codapInterface.sendRequest({
        action: 'delete',
        resource: `dataContext[${dataContext}].collection[cases].attribute[${attributeName}]`
    });

    if (response.success) {
        console.log(`${attributeName} successfully deleted from ${dataContext}.`);
    } else {
        console.error(`Failed to delete ${attributeName} attribute from ${dataContext}.`);
    }
}