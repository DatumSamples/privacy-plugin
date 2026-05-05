function getDataSelected() {
    const doc = document.getElementById('datasets').value;
    alert(`This is the dataset you have chosen: ${doc}`)
}

const datasets = {
    "patient_records": ["Name", "DateOfBirth", "Zipcode", "Diagnosis", "MedicalExpense", "PrescribedMedication", "BloodType", "MaritalStatus"],
    "employee_salaries": ["Name", "DateOfBirth", "Zipcode", "Salary", "PerformanceRating", "Bonus", "JobTitle", "YearsAtCompany"],
    "ecommerce_transactions": ["Name", "DateOfBirth", "Zipcode", "PurchaseCategory", "CreditScore", "PurchaseAmount", "PaymentMethod", "MembershipLevel"]
};

function getDataSelected() {
    const doc = document.getElementById('datasets').value;
    alert(`This is the dataset you have chosen: ${doc}`);
}

function updateAttributes() {
    const dataset = document.getElementById("datasets").value;
    const attributes = datasets[dataset] || [];
    
    const sensAttSelect = document.getElementById("sensAtt");
    sensAttSelect.innerHTML = attributes.map(attr => `<option value="${attr}">${attr}</option>`).join('');
    
    const quasiIdentifiersDiv = document.getElementById("quasiIdentifiers");
    quasiIdentifiersDiv.innerHTML = attributes.map(attr => `
        <div>
            <input type="checkbox" id="${attr}" name="quasiIdentifiers" value="${attr}">
            <label for="${attr}">${attr}</label>
        </div>
    `).join('');
}

async function applyLDiversity(){
    // Retrieve L-Diversity level using valueAsNumber
    const lLevelInput = parseInt(document.getElementById("lValue").value);
    console.log(lLevelInput);

    // Get the sensitive attribute from the drop-down
    const sensAttElement = document.getElementById("sensAtt");
    const sensitiveAttribute = sensAttElement ? sensAttElement.value : null;
    
    // Get the quasi-identifiers (only the checked checkboxes)
    const quasiIdentifiers = [];
    const quasiDiv = document.getElementById("quasiIdentifiers");
    if(quasiDiv){
        const checkboxes = quasiDiv.querySelectorAll("input[type='checkbox']:checked");
        checkboxes.forEach(cb => {
            quasiIdentifiers.push(cb.value);
        });
    }
    
    // Validate inputs
    if (!Number.isInteger(lLevelInput) || lLevelInput <= 0) {
        alert("Please enter a valid positive integer for the L-Diversity Level.");
        return;
    }
    if(!sensitiveAttribute) {
       alert("Please select a sensitive attribute.");
       return;
    }
    if(quasiIdentifiers.length === 0){
       alert("Please select at least one quasi-identifier.");
       return;
    }
    
    // Determine the CODAP dataset context name from the dropdown (default if not set)
    let datasetName = "defaultDataset";
    const datasetElement = document.getElementById("datasets");
    if(datasetElement){
        datasetName = datasetElement.value;
    }
    
    try {
        // Retrieve all cases from CODAP (each case has a structure: { case: { id, values } })
        const isDataLoaded = await checkIfDataLoaded(datasetName);
        if (!isDataLoaded) {
            await loadCSVDataFromFolder('l_diversity', 'try', datasetName + '.csv')
        }
        await toggleTable(datasetName, true)

        const cases = await getAllCases(datasetName);
        if(!cases || cases.length === 0){
            alert("No data found in the dataset.");
            return;
        }
         
        // Group rows based on the selected quasi-identifiers.
        let groups = {};
        cases.forEach(item => {
            const row = item.case.values;
            // Build a group key by joining the values for each quasi-identifier.
            let key = quasiIdentifiers.map(attr => row[attr]).join("|");
            if(!groups[key]){
                groups[key] = [];
            }
            groups[key].push({
                id: item.case.id,
                values: row
            });
        });
         
        // Array to collect IDs of cases that do not meet the L-Diversity requirement.
        let nonCompliantCaseIDs = [];
         
         // For each group, check if the number of distinct sensitive values meets the L-level.
        for (let key in groups) {
            const group = groups[key];
            let sensitiveValues = new Set();
            group.forEach(item => {
                sensitiveValues.add(item.values[sensitiveAttribute]);
            });
            // If the group has fewer distinct sensitive values than the required L-level, mark all cases as non-compliant.
            if(sensitiveValues.size < lLevelInput){
               nonCompliantCaseIDs.push(...group.map(item => item.id));
            }
        }
         
        // Save non-compliant IDs globally for later use if needed.
        window.lDiversityNonCompliantCaseIDs = nonCompliantCaseIDs;
        console.log("Non-compliant case IDs:", nonCompliantCaseIDs);
         
        // Create a new attribute in CODAP to store L-Diversity compliance status.
        let createAttrResponse = await codapInterface.sendRequest({
            action: 'create',
            resource: `dataContext[${datasetName}].collection[cases].attribute`,
            values: {
                name: "LDiversityCompliance",
                type: "categorical",
                description: "Compliance status for L-Diversity (Compliant/Non-Compliant)"
            }
        });
         
        if(createAttrResponse.success){
            console.log("LDiversityCompliance attribute created.");
        } else {
            console.warn("LDiversityCompliance attribute may already exist.");
        }
         
        // Prepare an update for each case to mark it as "Non-Compliant" or "Compliant"
        let updatedCases = cases.map(item => {
           const status = nonCompliantCaseIDs.includes(item.case.id) ? "❌" : "✅";
           return {
               id: item.case.id,
               values: { LDiversityCompliance: status }
           };
        });
         
         // Update the CODAP table with the compliance status.
         const updateResponse = await codapInterface.sendRequest({
            action: 'update',
            resource: `dataContext[${datasetName}].collection[cases].case`,
            values: updatedCases
        });
         
        if (updateResponse.success) {
            console.log("CODAP table updated with L-Diversity compliance status.");
        } else {
            console.error("Failed to update the CODAP table with compliance status.");
             alert("L-Diversity applied but failed to update the CODAP table.");
        }
         
    } catch(error){
        console.error("Error applying L-Diversity:", error);
        alert("Error applying L-Diversity. See console for details.");
    }
}
