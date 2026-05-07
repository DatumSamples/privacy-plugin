// Function to load a CSV file from a URL
async function loadTClosenessCSVData(datasetFolder, datasetName) {
    const csvURL = window.location.href.replace(/\/[^\/]*$/, "") + `/data/t_closeness/${datasetFolder}/${datasetName}`;
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

document.addEventListener("DOMContentLoaded", () => {
    // Tooltip
    const tooltip = d3.select("body")
                        .append("div")
                        .attr("class", "t-closeness-tooltip");

    const svg = d3.select("#tClosenessScatterPlot");
    const width = 500;
    const height = 450;
    const margin = { top: 25, right: 75, bottom: 50, left: 50 };

    svg.attr("width", width)
       .attr("height", height);

    const plotGroup = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xAxisGroup = plotGroup.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${innerHeight})`)
        .style("opacity", 0);

    const yAxisGroup = plotGroup.append("g")
        .attr("class", "y-axis")
        .style("opacity", 0);

    // Axis labels
    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("text-anchor", "middle")
        .attr("x", margin.left + innerWidth / 2)
        .attr("y", height - 10)
        .text("Anonymity Level");

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("text-anchor", "middle")
        .attr("transform", `translate(15, ${margin.top + innerHeight / 2}) rotate(-90)`)
        .text("T-Closeness Level");

    // Color scale
    const colorScale = d3.scaleSequential()
        .domain([0, 1]) // t_closeness range
        .interpolator(d3.interpolateOranges);

    // Radius scale
    const radiusScale = d3.scaleLinear()
        .domain([0, 1])
        .range([3, 10]);

    function drawColorLegend() {
        const legendWidth = 15;
        const legendHeight = 150;
        const legendMargin = 10;

        const legendGroup = svg.append("g")
            .attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);

        // Gradient definition
        const defs = svg.append("defs");
        const gradient = defs.append("linearGradient")
            .attr("id", "colorGradient")
            .attr("x1", "0%").attr("y1", "100%")
            .attr("x2", "0%").attr("y2", "0%");

        for (let i = 0; i <= 100; i++) {
            gradient.append("stop")
                .attr("offset", `${i}%`)
                .attr("stop-color", colorScale(i / 100));
        }

        // Color bar
        legendGroup.append("rect")
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .style("fill", "url(#colorGradient)");

        // Axis for legend
        const legendScale = d3.scaleLinear()
            .domain(colorScale.domain())
            .range([legendHeight, 0]);

        const legendAxis = d3.axisRight(legendScale)
            .ticks(5)
            .tickFormat(d3.format(".2f"));

        legendGroup.append("g")
            .attr("transform", `translate(${legendWidth}, 0)`)
            .call(legendAxis);

        legendGroup.append("text")
            .attr("x", -10)
            .attr("y", -8)
            .attr("font-size", 11)
            .attr("text-anchor", "start")
            .text("T-Closeness");
    }

    let currentDataContextName = null;
    let previousDatasetName = null;
    
    function drawScatterPlot(data, datasetFolder, yAxisField) {
        const xScale = d3.scaleLinear()
            .domain(d3.extent(data, d => 1-d.anonymity_level)).nice()
            .range([0, innerWidth]);
    
        const yScale = d3.scaleLinear()
            .domain(d3.extent(data, d => +d[yAxisField])).nice()
            .range([innerHeight, 0]);
    
        xAxisGroup
            .transition()
            .duration(500)
            .style("opacity", 1)
            .call(d3.axisBottom(xScale).ticks(6));
    
        yAxisGroup
            .transition()
            .duration(500)
            .style("opacity", 1)
            .call(d3.axisLeft(yScale).ticks(6));
    
        const dots = plotGroup.selectAll("circle")
            .data(data, d => d.dataset_new_id);
    
        dots.exit()
            .transition()
            .duration(300)
            .attr("r", 0)
            .remove();
    
        dots.transition()
            .duration(600)
            .attr("cx", d => xScale(+d.anonymity_level))
            .attr("cy", d => yScale(+d[yAxisField]))
            .attr("fill", d => colorScale(1-d.t_closeness))
            .attr("r", d => radiusScale(1-d.t_closeness));
    
        dots.enter()
            .append("circle")
            .attr("cx", d => xScale(+d.anonymity_level))
            .attr("cy", d => yScale(+d[yAxisField]))
            .attr("r", 0)
            .attr("fill", d => colorScale(1-d.t_closeness))
            .on("mouseover", (event, d) => {
                tooltip.style("opacity", 1)
                    .html(`
                        <strong>Anonymity:</strong> ${d.anonymity_level}<br/>
                        <strong>Diversity:</strong> ${d.diversity_level}<br/>
                        <strong>T-Closeness:</strong> ${1-d.t_closeness.toFixed(4)}
                    `)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mousemove", event => {
                tooltip.style("left", (event.pageX + 10) + "px")
                       .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltip.style("opacity", 0);
            })
            .on("click", async (event, d) => {
                const fileName = `${d.dataset_new_id}.csv`;
                const newContextName = d.dataset_new_id;
    
                try {
                    if (currentDataContextName && currentDataContextName !== newContextName) {
                        await deleteDataContext(currentDataContextName);
                    }
                    await loadTClosenessCSVData(datasetFolder, fileName);
                    currentDataContextName = newContextName;
                    console.log(`Loaded dataset: ${fileName}`);
                } catch (err) {
                    console.error(err);
                    console.log(`Failed to load dataset: ${fileName}`);
                }
            })
            .transition()
            .duration(500)
            .attr("r", d => radiusScale(1-d.t_closeness));
    }

    async function loadAndDraw(datasetFolder, yAxisField) {
        const basePath = window.location.href.replace(/\/[^\/]*$/, "");
        const response = await fetch(`${basePath}/data/t_closeness/${datasetFolder}/summary.csv`);
        const csvText = await response.text();
        const data = d3.csvParse(csvText, d => ({
            dataset_new_id: d.dataset_new_id,
            anonymity_level: +d.anonymity_level,
            diversity_level: +d.diversity_level,
            t_closeness: 1-d.t_closeness
        }));
        drawScatterPlot(data, datasetFolder, yAxisField);
    
        if (!svg.select("#colorGradient").node()) {
            drawColorLegend();
        }
    
        // Update y-axis label
        svg.select(".y-axis-label")
            .text(yAxisField === "diversity_level" ? "Diversity Level" : "T-Closeness Level");
    }

    function showDatasetMetadata(datasetName) {
        const metadata = {
            adult : {
                quasi_ident: 'age, marital-status, sex, native-country',
                ident: 'race',
                sens_att: 'salary-class',
                url: 'https://archive.ics.uci.edu/dataset/2/adult'
            },
            gpa: {
                quasi_ident: 'studyweek, sleepnight',
                ident: 'gender',
                sens_att: 'gpa',
                url: 'https://www.kaggle.com/datasets/joebeachcapital/duke-students-gpa'
            },
            insurance: {
                quasi_ident: 'age, bmi',
                ident: 'children',
                sens_att: 'charges',
                url: 'https://www.kaggle.com/datasets/mirichoi0218/insurance'
            }
        }
        document.querySelector('#current_ds_quasi_ident').innerHTML = `<strong>Quasi-Identifier(s):</strong> ${metadata[datasetName].quasi_ident}`
        document.querySelector('#current_ds_ident').innerHTML = `<strong>Identifier(s):</strong> ${metadata[datasetName].ident}`;
        document.querySelector('#curren_ds_sens_att').innerHTML = `<strong>Sensitive Attribute(s):</strong> ${metadata[datasetName].sens_att}`;
        document.querySelector('#ds_origin').innerHTML = `Original dataset available at: <a href="${metadata[datasetName].url}" target="_blank">${metadata[datasetName].url}</a>`;
    }

    
    async function updateChartFromSelections() {
        const selectedDatasetName = document.querySelector('#t-closeness-dataset-selector').value;
        const selectedYAxis = document.querySelector('#t-closeness-yAxisSelector').value;

        if (selectedDatasetName) {
            await loadAndDraw(selectedDatasetName, selectedYAxis);

            // If the dataset has changed, unload the old one and load the new one
            if (selectedDatasetName !== previousDatasetName) {
                try {
                    await deleteDataContext("original");
                    await loadTClosenessCSVData(datasetFolder = selectedDatasetName, datasetName = "original.csv");
                    showDatasetMetadata(selectedDatasetName);
                    previousDatasetName = selectedDatasetName;

                    console.log(`Loaded dataset: original.csv from ${selectedDatasetName}`);
                } catch (err) {
                    console.error(err);
                    console.log(`Failed to load original.csv for dataset: ${selectedDatasetName}`);
                }
            }
        }
    }
    
    document.querySelector('#t-closeness-dataset-selector').addEventListener('change', updateChartFromSelections);
    document.querySelector('#t-closeness-yAxisSelector').addEventListener('change', updateChartFromSelections);
});
