// Differential Modules State Variable
const differentialState = {
    currentDataset: null,
    currentAttribute: null,
    currentAttributeType: null,
    attributeInitialized: false,
    graphOpened: false
};

// Function to show the submodules for differential privacy main module
async function showDifferentialModule(moduleID) {
    const modules = document.querySelectorAll('.privacyModule, #main');
    modules.forEach(module => module.style.display = 'none');
    document.getElementById(moduleID).style.display = 'block';

    if (moduleID === 'differentialNumerical') {

        const numericalAttributeName = 'Age';
        const dataContext = 'adult_data';

        // Load data only once
        const isDataLoaded = await checkIfDataLoaded(dataContext);
        if (!isDataLoaded) {
            await loadCSVDataFromFolder('differential', 'try', dataContext + '.csv');
        }
        await toggleTable(dataContext, true);

        try {
            // Initialize Noise and Noisy Numerical Attribute
            await initializeNoisyNumerical(dataContext);
            await initializeNoisyAttribute(numericalAttributeName, dataContext);
            
            // Get true count for the example query and update display
            const trueCount = await getTrueCount();
            document.getElementById('originalResult').textContent = trueCount;
            document.getElementById('noisyResult').textContent = trueCount;
            document.getElementById('originalResult').style.color = '#00509e';
            document.getElementById('noisyResult').style.color = '#00509e';
            
            // Open graph after everything is initialized
            await openGraph(`${numericalAttributeName} Vs. Noisy ${numericalAttributeName}`, 
                          numericalAttributeName, 
                          `Noisy ${numericalAttributeName}`, 
                          dataContext);                  
        } catch (error) {
            console.error('Error initializing Numerical Differential Privacy Module:', error);
        }
    }
    else if (moduleID === 'differentialCategorical') {

        const categoricalAttributeName = 'Relationship';
        const dataContext = 'adult_data';

        const isDataLoaded = await checkIfDataLoaded(dataContext);
        if (!isDataLoaded) {
            await loadCSVDataFromFolder('differential', 'try', dataContext + '.csv');
        }
        await toggleTable(dataContext, true);
        
        try {
            // Display original distribution and initialize noisy version
            await displayOriginalDistribution(categoricalAttributeName, dataContext);
            await initializeNoisyCategorical(categoricalAttributeName, dataContext);
            
            const caseFeatures = await getCategoricalFeatures(categoricalAttributeName, dataContext);
            const uniqueCategories = caseFeatures[1];
            const sortedCategories = uniqueCategories.sort();
            
            // Open graph after everything is initialized
            await openCategoricalGraph(`Noisy ${categoricalAttributeName}`, sortedCategories, dataContext);
        } catch (error) {
            console.error('Error initializing Categorical Differential Privacy Module:', error);
        }
    }
}

// Function to initialize Noise column
async function initializeNoisyNumerical(dataContext) {

    // Initialize Noise attribute and send to CODAP
    const response = await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${dataContext}].collection[cases].attribute`,
        values: {
            name: 'Noise',
            type: 'numeric',
            precision: 2,
            description: 'Noise Generated'
        }
    });

    if (response.success) {
        console.log('Noise attribute created successfully.');

        // Set Noise column to 0 for all cases and send to CODAP
        const cases = await getAllCases(dataContext);
        const updatedCases = cases.map(item => ({
            id: item.case.id,
            values: { Noise: 0 }
        }));

        const updateResponse = await codapInterface.sendRequest({
            action: 'update',
            resource: `dataContext[${dataContext}].collection[cases].case`,
            values: updatedCases
        });

        if (updateResponse.success) {
            console.log('All Noise values initialized to 0.');
        } else {
            console.error('Failed to initialize Noise values.');
        }
    } else {
        console.error('Failed to create Noise attribute.');
    }
}

// Function to initialize Noisy numerical attribute column 
async function initializeNoisyAttribute(numericalAttribute, dataContext) {
    //Append ` to the front and back of numericalAttribute to handle cases where attribute name has spaces
    const response = await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${dataContext}].collection[cases].attribute`,
        values: {
            name: `Noisy ${numericalAttribute}`,
            type: 'numeric',
            precision: 2,
            formula: `\`${numericalAttribute}\` + Noise`,
            description: `Noisy ${numericalAttribute}`
        }
    });

    if (response.success) {
        console.log(`Noisy ${numericalAttribute} attribute created successfully.`);
    } else {
        console.error(`Failed to create Noisy ${numericalAttribute} attribute.`);
    }
}

// Function to generate laplace noise for a given sensitivity and epsilon
// Algorithm code adapted/inspired from https://stackoverflow.com/questions/46263596/laplace-noise-distribution-in-javascript
function laplaceNoise(sensitivity, epsilon) {
    const scale = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    return 0.0 - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
} 

// Function to apply differential privacy and update only the Noise column
async function generateNumericalNoise(dataContext, epsilon, sensitivity) {

    // Generate noise using Laplace Mechanism and send to CODAP
    const cases = await getAllCases(dataContext);
    const updatedCases = cases.map(item => ({
        id: item.case.id,
        values: { Noise: Math.round(laplaceNoise(sensitivity, epsilon)).toFixed(2) }
    }));

    const response = await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${dataContext}].collection[cases].case`,
        values: updatedCases
    });

    if (response.success) {
        console.log('Noise values updated successfully.');
        await codapInterface.sendRequest({
            action: 'notify',
            resource: 'component[NumericalGraph]',
            values: { request: 'autoScale' }
        });
    } else {
        console.error('Failed to update Noise values.');
    }
}

// Function to retrieve the true count for the example query
async function getTrueCount() {
    const response = await codapInterface.sendRequest({
        action: 'get',
        resource: 'dataContext[adult_data].collection[cases].caseFormulaSearch[Age >= 40]'
    });

    if (response.success) {
        return response.values.length;
    } else {
        console.error('Failed to retrieve true count.');
        return 0;
    }
}

// Function to apply differential privacy to the example query
async function getNoisyQuery() {
    const epsilon = parseFloat(document.getElementById('epsilonValueNumerical').textContent);
    const sensitivity = parseFloat(document.getElementById('sensitivityValueNumerical').textContent);
    const trueCount = await getTrueCount();
    const noisyCount = Math.round(trueCount + laplaceNoise(sensitivity, epsilon));
    document.getElementById('noisyResult').textContent = noisyCount;
    document.getElementById('noisyResult').style.color = 'red';
}

// Function that calculates the score (frequency) of each category
// Algorithm code adapted/inspired from https://programming-dp.com/ch9.html
function score(data, option) {
    const counts = data.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
    return counts[option]/1000 || 0; 
}

// Function that implements the Exponential Mechanism
// Algorithm code adapted/inspired from https://programming-dp.com/ch9.html
function exponentialMechanism(categories, scores, epsilon, sensitivity) {
    const probabilities = scores.map(score => Math.exp(epsilon * score / (2 * sensitivity)));
    const sumProbabilities = probabilities.reduce((a, b) => a + b, 0);
    const normalizedProbabilities = probabilities.map(p => p / sumProbabilities);

    let cumulativeProbability = 0;
    const randomValue = Math.random();
    for (let i = 0; i < categories.length; i++) {
        cumulativeProbability += normalizedProbabilities[i];
        if (randomValue <= cumulativeProbability) {
            return categories[i];
        }
    }
    return 'undefined'; 
}

// Function to display the original distribution for a categorical attribute in a table with both original and noisy columns
async function displayOriginalDistribution(categoricalAttribute, dataContext) {

    // Get distribution of original attribute and normalize it and display in table
    const caseFeatures = await getCategoricalFeatures(categoricalAttribute, dataContext);
    const allCases = caseFeatures[0];
    const uniqueCategories = caseFeatures[1];
    
    const originalDistribution = uniqueCategories.reduce((acc, category) => {
        acc[category] = score(allCases, category) * 1000;
        return acc;
    }, {});
    
    const totalCases = allCases.length;
    const normalizedOriginalDistribution = {};
    for (const [category, count] of Object.entries(originalDistribution)) {
        normalizedOriginalDistribution[category] = ((count / totalCases) * 100).toFixed(1) + '%';
    }

    // Initially, set noisy distribution to be the same as original
    const sortedCategories = Object.keys(normalizedOriginalDistribution).sort();
    let tableHTML = "<table class='distribution-table'><tr><th>Category</th><th>Original %</th><th>Noisy %</th></tr>";
    sortedCategories.forEach(category => {
        const percentage = normalizedOriginalDistribution[category];
        tableHTML += `<tr><td>${category}</td><td style='color: #00509e;'>${percentage}</td><td id='noisy-${category}' style='color: #00509e;'>${percentage}</td></tr>`;
    });
    tableHTML += '</table>';
    document.getElementById('distributionTable').innerHTML = tableHTML;
}

// Function to initialize the noisy version of a categorical attribute with original values
async function initializeNoisyCategorical(attribute, dataContext) {

    // Initialize Noisy [attribute] and send to CODAP
    const response = await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${dataContext}].collection[cases].attribute`,
        values: {
            name: `Noisy ${attribute}`,
            type: 'categorical',
            description: `Noisy version of ${attribute}`
        }
    });

    if (response.success) {
        console.log(`Noisy ${attribute} attribute created successfully.`);

        // Fill initial values of Noisy [attribute] with original values of the categorical attribute
        const cases = await getAllCases(dataContext);
        const updatedCases = cases.map(item => ({
            id: item.case.id,
            values: { [`Noisy ${attribute}`]: item.case.values[attribute] }
        }));

        // Send updated cases to CODAP
        const updateResponse = await codapInterface.sendRequest({
            action: 'update',
            resource: `dataContext[${dataContext}].collection[cases].case`,
            values: updatedCases
        });

        if (updateResponse.success) {
            console.log(`Noisy ${attribute} initialized with original values.`);
        } else {
            console.error(`Failed to initialize Noisy ${attribute} with original values.`);
        }
    } else {
        console.error(`Failed to create Noisy ${attribute} attribute.`);
    }
}

// Function to apply differential privacy, update Noisy [attribute] using Exponential Mechanism, and update noisy column in the table
async function generateCategoricalNoise(categoricalAttribute, dataContext, epsilon, sensitivity, iterations=1000) {
    const caseFeatures = await getCategoricalFeatures(categoricalAttribute, dataContext);
    const allCases = caseFeatures[0];
    const uniqueCategories = caseFeatures[1];
    const scores = uniqueCategories.map(category => score(allCases, category));
    const categoryFrequency = {};
    uniqueCategories.forEach(category => categoryFrequency[category] = 0);

    // Update cases with noisy categories
    const cases = await getAllCases(dataContext);
    const updatedCases = cases.map(item => {
        const noisyCategory = exponentialMechanism(uniqueCategories, scores, epsilon, sensitivity);
        if (noisyCategory !== 'undefined') {
            categoryFrequency[noisyCategory]++;
        }
        return {
            id: item.case.id,
            values: { [`Noisy ${categoricalAttribute}`]: noisyCategory }
        };
    });

    // Send updated cases to CODAP
    const response = await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${dataContext}].collection[cases].case`,
        values: updatedCases
    });

    if (response.success) {
        console.log(`Noisy ${categoricalAttribute} data updated successfully.`);
        // Update the noisy column in the table with new percentages
        for (const [category, count] of Object.entries(categoryFrequency)) {
            const percentage = ((count / iterations) * 100).toFixed(1) + '%';
            document.getElementById(`noisy-${category}`).textContent = percentage;
            document.getElementById(`noisy-${category}`).style.color = 'red';
        }
    } else {
        console.error(`Failed to update Noisy ${categoricalAttribute} data.`);
    }
}

// Function to reset everything in the numerical differential privacy module
async function resetNumerical(dataContext) {

    // Reset Noise column
    const cases = await getAllCases(dataContext);
    const updatedCases = cases.map(item => ({
        id: item.case.id,
        values: { Noise: 0 }
    }));

    const response = await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${dataContext}].collection[cases].case`,
        values: updatedCases
    })

    if (response.success) {
        console.log('Reset successful');
        // Autoscale graph
        await codapInterface.sendRequest({
            action: 'notify',
            resource: 'component[NumericalGraph]',
            values: { request: 'autoScale' }
        });
    } else {
        console.error('Failed to reset numerical graph.');
    }

    // Reset noisy query result and sliders
    const trueCount = await getTrueCount();
    document.getElementById('noisyResult').textContent = trueCount;
    document.getElementById('noisyResult').style.color = "#00509e";
    document.getElementById('epsilonSliderNumerical').value = 0.1;
    document.getElementById('epsilonValueNumerical').textContent = "0.1";
    document.getElementById('sensitivitySliderNumerical').value = 1.0;
    document.getElementById('sensitivityValueNumerical').textContent = "1.0";
    document.getElementById('numerical-epsilon-input').value = 0.1;
    document.getElementById('numerical-sensitivity-input').value = 1.0;
}

// Function to reset everything in the categorical differential privacy module
async function resetCategorical(attribute, dataContext) {

    // Reset Noisy Categorical column
    const cases = await getAllCases(dataContext);
    const caseFeatures = await getCategoricalFeatures(attribute, dataContext);
    const allCases = caseFeatures[0];
    const uniqueCategories = caseFeatures[1];

    const updatedCases = cases.map(item => ({
        id: item.case.id,
        values: { [`Noisy ${attribute}`]: item.case.values[attribute] }
    }));

    await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${dataContext}].collection[cases].case`,
        values: updatedCases
    });

    // Reset table percentages for categorical data
    const normalizedOriginalDistribution = {};
    const totalCases = allCases.length;
    uniqueCategories.forEach(category => {
        const originalCount = score(allCases, category)*1000;
        normalizedOriginalDistribution[category] = ((originalCount / totalCases) * 100).toFixed(1) + '%';
    });

    uniqueCategories.forEach(category => {
        document.getElementById(`noisy-${category}`).textContent = normalizedOriginalDistribution[category];
        document.getElementById(`noisy-${category}`).style.color = "#00509e";
    });

    // Reset sliders
    document.getElementById('epsilonSliderCategorical').value = 0.1;
    document.getElementById('epsilonValueCategorical').textContent = "0.1";
    document.getElementById('sensitivitySliderCategorical').value = 1.0;
    document.getElementById('sensitivityValueCategorical').textContent = "1.0";
    document.getElementById('categorical-epsilon-input').value = 0.1;
    document.getElementById('categorical-sensitivity-input').value = 1.0;
}

// Function to reset numerical module, clears the added attributes and closes the graph
async function numericalBack(attribute, dataContext) {
    await resetNumerical(dataContext);
    await closeGraph('NumericalGraph');
    await deleteAttribute(`Noisy ${attribute}`, dataContext);
    await deleteAttribute('Noise', dataContext);
    await toggleTable(dataContext, false);
    await showModule('differentialMainScreen');
}

// Function to reset categorical module, clears the added attributes and closes the graph
async function categoricalBack(attribute, dataContext) {
    await resetCategorical(attribute, dataContext);
    await closeGraph('DistributionGraph'); 
    await deleteAttribute(`Noisy ${attribute}`, dataContext);
    await toggleTable(dataContext, false);
    await showModule('differentialMainScreen');
}

// Dataset attributes mapping for Try It Out Module
const datasetAttributes = {
    'adult_data': {
        numerical: ['Age', 'Hours Per Week', 'Capital Gain', 'Capital Loss'],
        categorical: ['Workclass', 'Education', 'Marital Status', 'Occupation', 'Relationship', 'Race']
    },
    'bank_marketing': {
        numerical: ['Age', 'Account Balance', 'Call Duration', 'Campaign Contacts', 'Days Since Last Contact', 'Previous Campaigns'],
        categorical: ['Job Type', 'Marital Status', 'Education Level', 'Contact Month', 'Previous Outcome']
    },
    'employee_analytics': {
        numerical: ['Age', 'Previous Year Rating', 'Length Of Service', 'Average Training Score'],
        categorical: ['Department', 'Region', 'Education Level', 'Number Of Trainings', 'Recruitment Channel']
    },
    'titanic': {
        numerical: ['Age', 'Ticket Fare'],
        categorical: ['Passenger Class', 'Siblings/Spouse Aboard', 'Parents/Children Aboard', 'Embarkation Port']
    },
    'hr_employee_attrition': {
        numerical: ['Age', 'Distance From Home', 'Monthly Income', 'Percent Salary Hike', 'Total Working Years', 'Years At Company', 'Years In Current Role'],
        categorical: ['Business Travel', 'Department', 'Education Field', 'Job Level', 'Job Role', 'Marital Status', 'Training Times Last Year']
    },
    'students_performance': {
        numerical: ['Math Score', 'Reading Score', 'Writing Score'],
        categorical: ['Race/Ethnicity', 'Parental Education Level', 'Test Preparation Course']
    },
    'hr_employee_data': {
        numerical: ['Satisfaction Level', 'Last Evaluation', 'Average Monthly Hours'],
        categorical: ['Department', 'Years At Company', 'Number Of Projects', 'Salary Level']
    }
};


// Function to handle attribute selection change
function handleAttributeChange() {
    
    // Enable the Start button and disable the Apply button
    document.getElementById('startButtonTryOut').disabled = false;
    document.getElementById('applyButtonTryOut').disabled = true;
    
    // Clear the results section
    document.getElementById('resultsSection').innerHTML = '';
    document.getElementById('resultsSection').style.display = 'none';
}

// Function to handle dataset selection change
function handleDatasetChange() {
    const datasetSelect = document.getElementById('datasetSelect');
    const selectedDataset = datasetSelect.value;
    const variableSelect = document.getElementById('variableSelect');
    
    if (!selectedDataset) {
        return;
    }

    // Clear previous options
    variableSelect.innerHTML = '<option value="" selected disabled>Choose a variable...</option>';
    
    // Populate variable options with both numerical and categorical attributes
    const numericalAttributes = datasetAttributes[selectedDataset].numerical;
    const categoricalAttributes = datasetAttributes[selectedDataset].categorical;
    
    // Add numerical attributes with indicator
    const numericalGroup = document.createElement('optgroup');
    numericalGroup.label = 'Numerical';
    numericalAttributes.forEach(attr => {
        const option = document.createElement('option');
        option.value = attr;
        option.textContent = attr;
        option.dataset.type = 'numerical';
        numericalGroup.appendChild(option);
    });
    variableSelect.appendChild(numericalGroup);
    
    // Add categorical attributes with indicator
    const categoricalGroup = document.createElement('optgroup');
    categoricalGroup.label = 'Categorical';
    categoricalAttributes.forEach(attr => {
        const option = document.createElement('option');
        option.value = attr;
        option.textContent = attr;
        option.dataset.type = 'categorical';
        categoricalGroup.appendChild(option);
    });
    variableSelect.appendChild(categoricalGroup);
    
    // Show variable selection and parameter controls
    document.getElementById('variableSelection').style.display = 'block';
    document.getElementById('parameterControls').style.display = 'block';
    
    // Reset results section and button states
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('startButtonTryOut').disabled = false;
    document.getElementById('applyButtonTryOut').disabled = true;
}

// Heper function to clean up attribute for applyDifferentialTryOut function
async function cleanAttribute() {

    if (!differentialState.attributeInitialized) {
        return;
    }

    if (differentialState.currentAttributeType === 'numerical') {
        await closeGraph('NumericalGraph');
        await deleteAttribute(`Noisy ${differentialState.currentAttribute}`, differentialState.currentDataset);
        await deleteAttribute('Noise', differentialState.currentDataset);
    } else {
        await closeGraph('DistributionGraph');
        await deleteAttribute(`Noisy ${differentialState.currentAttribute}`, differentialState.currentDataset);
    }
    differentialState.attributeInitialized = false;
}

// Function to initialize Try It Out Module Attributes
async function initializeDifferentialTryOut() {
    const datasetSelect = document.getElementById('datasetSelect');
    const variableSelect = document.getElementById('variableSelect');
    
    // Check if selection is empty
    if (!variableSelect.value) {
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-danger">Error: Please select a variable</div>';
        document.getElementById('resultsSection').style.display = 'block';
        return;
    }

    const selectedDataset = datasetSelect.value;
    const selectedOption = variableSelect.options[variableSelect.selectedIndex];
    const selectedVariable = selectedOption.value;
    const variableType = selectedOption.dataset.type;
    
    document.getElementById('resultsSection').innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    document.getElementById('resultsSection').style.display = 'block';

    try {

        // If changing dataset or attribute, clean up previous setup
        if (differentialState.attributeInitialized) {
            await cleanAttribute();
        }

        // Close any previously opened tables
        if (differentialState.currentDataset !== selectedDataset) {
            await toggleTable(differentialState.currentDataset, false);
        }

        // Check if dataset is loaded otherwise just open it
        const isDataLoaded = await checkIfDataLoaded(selectedDataset);
        if (!isDataLoaded) {
            await loadCSVDataFromFolder('differential', 'try', selectedDataset + '.csv');
        } else {
            await toggleTable(selectedDataset, true);
        }

        // Initialize new attributes based on type
        if (variableType === 'numerical') {
            await initializeNoisyNumerical(selectedDataset);
            await initializeNoisyAttribute(selectedVariable, selectedDataset);
            await openGraph(`${selectedVariable} Vs. Noisy ${selectedVariable}`, 
                          selectedVariable, 
                          `Noisy ${selectedVariable}`, 
                          selectedDataset);
        } else {
            await initializeNoisyCategorical(selectedVariable, selectedDataset);
            const caseFeatures = await getCategoricalFeatures(selectedVariable, selectedDataset);
            const uniqueCategories = caseFeatures[1];
            const sortedCategories = uniqueCategories.sort();
            await openCategoricalGraph(`Noisy ${selectedVariable}`, sortedCategories, selectedDataset);
            await displayOriginalDistribution(selectedVariable, selectedDataset);
        }

        // Update state
        differentialState.currentDataset = selectedDataset;
        differentialState.currentAttribute = selectedVariable;
        differentialState.currentAttributeType = variableType;
        differentialState.attributeInitialized = true;
        differentialState.graphOpened = true;
        
        // Enable Apply button and disable Start button
        document.getElementById('applyButtonTryOut').disabled = false;
        document.getElementById('startButtonTryOut').disabled = true;
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-success">Initialization completed successfully. You can now apply differential privacy.</div>';
    } catch (error) {
        console.error('Error initializing differential privacy:', error);
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-danger">Error initializing: ' + error.message + '</div>';
    }
}

// Function to apply differential privacy to Try It Out Module
async function applyDifferentialTryOut() {
    if (!differentialState.attributeInitialized) {
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-danger">Error: Please click Start first to initialize</div>';
        document.getElementById('resultsSection').style.display = 'block';
        return;
    }
    
    document.getElementById('resultsSection').innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    document.getElementById('resultsSection').style.display = 'block';

    try {
        // Apply differential privacy based on type
        const epsilon = parseFloat(document.getElementById('epsilonValueTryOut').textContent);
        const sensitivity = parseFloat(document.getElementById('sensitivityValueTryOut').textContent);

        if (differentialState.currentAttributeType === 'numerical') {
            await generateNumericalNoise(differentialState.currentDataset, epsilon, sensitivity);
        } else {
            await generateCategoricalNoise(differentialState.currentAttribute, differentialState.currentDataset, epsilon, sensitivity);
        }
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-success">Differential privacy applied successfully!</div>';
    } catch (error) {
        console.error('Error applying differential privacy:', error);
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-danger">Error applying differential privacy: ' + error.message + '</div>';
    }
}

// Function to reset the Try It Out module
async function resetTryItOut() {
    if (!differentialState.currentDataset || !differentialState.currentAttribute) {
        return;
    }
    
    // Reset based on attribute type
    try {
        if (differentialState.currentAttributeType === 'numerical') {
            await resetNumerical(differentialState.currentDataset);
        } else {
            await resetCategorical(differentialState.currentAttribute, differentialState.currentDataset);
        }
        
        // Reset parameters
        document.getElementById('epsilonSliderTryOut').value = 0.1;
        document.getElementById('epsilonValueTryOut').textContent = "0.1";
        document.getElementById('sensitivitySliderTryOut').value = 1.0;
        document.getElementById('sensitivityValueTryOut').textContent = "1.0";
        document.getElementById('try-epsilon-input').value = 0.1;
        document.getElementById('try-sensitivity-input').value = 1.0;
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-info">Reset successful</div>';
    } catch (error) {
        console.error('Error resetting Try It Out module:', error);
        document.getElementById('resultsSection').innerHTML = '<div class="alert alert-danger">Error resetting: ' + error.message + '</div>';
    }
}

// Function to handle going back from Try It Out module
async function DiffTryItOutBack() {

    // Clean up attribute if it exists, close graph, and close table
    if (differentialState.currentDataset && differentialState.currentAttribute && differentialState.attributeInitialized) {
        try {
            if (differentialState.currentAttributeType === 'numerical') {
                await resetNumerical(differentialState.currentDataset);
                await closeGraph('NumericalGraph');
                await deleteAttribute(`Noisy ${differentialState.currentAttribute}`, differentialState.currentDataset);
                await deleteAttribute('Noise', differentialState.currentDataset);
            } else {
                await resetCategorical(differentialState.currentAttribute, differentialState.currentDataset);
                await closeGraph('DistributionGraph');
                await deleteAttribute(`Noisy ${differentialState.currentAttribute}`, differentialState.currentDataset);
            }
            await toggleTable(differentialState.currentDataset, false);
        } catch (error) {
            console.error('Error cleaning up Try It Out module:', error);
        }
    }

    // Reset module to original state
    document.getElementById('datasetSelect').value = '';
    document.getElementById('variableSelection').style.display = 'none';
    document.getElementById('parameterControls').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('startButtonTryOut').disabled = false;
    document.getElementById('applyButtonTryOut').disabled = true;
    document.getElementById('epsilonSliderTryOut').value = 0.1;
    document.getElementById('epsilonValueTryOut').textContent = "0.1";
    document.getElementById('sensitivitySliderTryOut').value = 1.0;
    document.getElementById('sensitivityValueTryOut').textContent = "1.0";
    document.getElementById('try-epsilon-input').value = 0.1;
    document.getElementById('try-sensitivity-input').value = 1.0;
    
    // Reset state variables
    differentialState.currentDataset = null;
    differentialState.currentAttribute = null;
    differentialState.currentAttributeType = null;
    differentialState.attributeInitialized = false;
    differentialState.graphOpened = false;
    await showModule('differentialMainScreen');
}