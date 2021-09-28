/// <reference path="d3.js" />

let values;

let _focus;
let root;

document.addEventListener("DOMContentLoaded", async function() {
  // insert any code that manipulates the DOM/HTML here
  let data = await d3.csv("../netflix_titles.csv")

  console.log(data.length)

  data = data.filter((val) => val.director.length > 0 && val.cast.length > 0)

  console.log(data.length)

  data = data.map((val) => {
    let cast = val.cast.split(", ");
    val.cast = cast;
    val.cast_size = cast.length
    return val;
  })

  /** @type {Map<String, Map<String, Number>>} */
  let directors_actors = new Map()

  data.forEach(entry => {
    entry.director.split(", ").forEach(director => {
      /** @type {Map<String, Number>} */
      let worked_with;
      if (directors_actors.has(director)) {
        worked_with = directors_actors.get(director)
      } else {
        worked_with = new Map()
        directors_actors.set(director, worked_with)
      }
      
      for (actor of entry.cast) {
        if (worked_with.has(actor)) {
          worked_with.set(actor, worked_with.get(actor) + 1)
        } else {
          worked_with.set(actor, 1)
        }
      }
    })
  });

  console.log(directors_actors)

  values = []
  directors_actors.forEach((val, director) => {
    let collab_arr = Array.from(val)
    let sum = collab_arr.reduce((acc, [ _, num ]) => acc + num, 0)
    let max = collab_arr.reduce((a, [_, num]) => Math.max(a, num), 0)

    values.push({
      name: director,
      children: collab_arr.map(([ actor, num ]) => ({
        name: actor,
        val: (Math.pow(val.size, 3) / sum) * num,
        actual: num,
        director: director,
      })),
      val: val.size,
      actual: val.size,
      max_collab: max
    })
  })
  
  document.getElementById("scroll-to").addEventListener("click", () => {
    document.getElementById("bubble-chart").scrollIntoView({ 
      behavior: 'smooth' 
    });
  })

  document.getElementById("generate").addEventListener("click", () => {
    let settings = new FormData(document.getElementById("settings"))

    let descending = settings.get("sorting") === "descending";
    let max = parseInt(settings.get("max_count"))
    let min_collab = parseInt(settings.get("min_collab"))
    let max_collab = parseInt(settings.get("max_collab"))

    if (min_collab > max_collab) alert("Maximum collaborators must be greater than or equal to minimum collaborators.")
    else generateLayout(descending, max, min_collab, max_collab);
  })

  generateLayout(true, 50, 5, 150)

  bulmaSlider.attach();
})

function generateLayout(descending = true, max, min_collab, max_collab) {
  let new_vals = values.sort((a, b) => {
    if (descending) return b.val - a.val
    else return a.val - b.val
  })
  .filter(val => val.val >= min_collab)
  .filter(val => val.val <= max_collab)
  .slice(0, max)

  let dir_domain_end = new_vals.reduce((a, { val }) => Math.max(a, val), 0);
  let dir_domain_start = new_vals.reduce((a, { val }) => Math.min(a, val), new_vals[0].val)
  let scale_func_director = d3.scaleLinear().domain([dir_domain_start, dir_domain_end]).range([0, 1])
  let act_domain_end = new_vals.reduce((a, { max_collab }) => Math.max(a, max_collab), 0);
  let scale_func_actor = d3.scaleLinear().domain([1, act_domain_end]).range([0, 1])

  const width = window.innerHeight;
  const height = window.innerHeight;

  root = d3.pack()
    .size([width, height])
    .padding(4)
    (d3.hierarchy({ children: new_vals })
      .sum(d => d.val)
      .sort((a, b) => {
        if (descending) return b.val - a.val
        else return a.val - b.val
      }))

  _focus = root;
  let view;

  let new_svg = document.getElementById("bubble-chart").cloneNode(false)
  document.getElementById("chart-column").replaceChild(new_svg, document.getElementById("bubble-chart"))

  const svg = d3.select("#bubble-chart")
    .attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`)
    .style("height", window.innerHeight)
    .style("width", window.innerWidth * 0.66)
    .style("display", "block")
    .style("margin", "0 -14px")
    .style("cursor", "pointer")
    .on("click", (event) => zoom(event, root));

  let last_director;
  const node = svg.append("g")
    .selectAll("circle")
    .data(root.descendants().slice(1))
    .enter()
    .append("circle")
    .attr('data-tippy-content', d => {
      if (d.children) return `Director: ${d.data.name}</br>Has worked with ${d.data.actual} actors.`
      else return `Actor: ${d.data.name}</br>Has worked with ${d.data.director} ${d.data.actual} times.`
    })
    .style('fill', d => {
      if (d.children) return d3.interpolateBlues(scale_func_director(d.data.val))
      else return d3.interpolateYlOrRd(scale_func_actor(d.data.actual))
    })
    .style("stroke", d => d.children ? null : "#000")
    .attr("stroke", d => d.children ? "lightgray" : null)
    .attr("pointer-events", d => !d.children ? "none" : null)
    .attr("director", d => !d.children ? d.data.director : null)
    .on("mouseover", function() { d3.select(this).attr("stroke", "#000"); })
    .on("mouseout", function() { d3.select(this).attr("stroke", "lightgrey"); })
    .on("click", (event, d) => {
      if (last_director) svg.selectAll(`circle[director="${last_director}"]`).attr("pointer-events", "none")
      if (d.depth == 1 && _focus !== d) {
        svg.selectAll(`circle[director="${d.data.name}"]`).attr("pointer-events", null)
        last_director = d.data.name
      }

      d.children && _focus !== d && (zoom(event, d), event.stopPropagation())
    });

  zoomTo([root.x, root.y, root.r * 2]);

  function zoomTo(v) {
    const k = width / v[2];

    view = v;

    node.attr("transform", d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
    node.attr("r", d => {
      return d.r * k
    });
  }

  function zoom(event, d) {
    _focus = d;

    const transition = svg.transition()
      .duration(event.altKey ? 7500 : 750)
      .tween("zoom", d => {
        const i = d3.interpolateZoom(view, [_focus.x, _focus.y, _focus.r * 2]);
        return t => zoomTo(i(t));
      });
  }

  tippy.setDefaultProps({
    placement: "auto",
    allowHTML: true,
    popperOptions: {
      strategy: 'fixed',
      modifiers: [{
        name: 'flip',
        options: {
          fallbackPlacements: ['bottom', 'right'],
          allowedAutoPlacements: ['left', 'right', 'bottom']
        },
      }]
    }
  })
  tippy("circle")

  let new_legends = document.getElementById("legends").cloneNode(false)
  document.getElementById("legends").parentElement.replaceChild(new_legends, document.getElementById("legends"))

  let range = dir_domain_end - dir_domain_start
  document.getElementById("legends").append(legend({
    color: d3.scaleSequential([dir_domain_start, dir_domain_end], d3.interpolateBlues),
    title: "Number of Actors Director has Worked With",
    ticks: range > 10 ? (range / 10) : (range > 0 ? range : 1)
  }))

  document.getElementById("legends").append(legend({
    color: d3.scaleSequential([1, act_domain_end], d3.interpolateYlOrRd),
    title: "Number of Times Actor has Worked With Director",
    ticks: act_domain_end
  }))
}

// legend generation functionality adapted from here: https://observablehq.com/@d3/color-legend
function legend({
  color,
  title,
  tickSize = 6,
  width = 320, 
  height = 44 + tickSize,
  marginTop = 18,
  marginRight = 0,
  marginBottom = 16 + tickSize,
  marginLeft = 0,
  ticks = width / 64,
  tickFormat,
  tickValues
} = {}) {

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("overflow", "visible")
    .style("display", "block");

  let tickAdjust = g => g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height);
  let x;

  // Sequential
  x = Object.assign(color.copy()
    .interpolator(d3.interpolateRound(marginLeft, width - marginRight)),
    {range() { return [marginLeft, width - marginRight]; }});

  svg.append("image")
    .attr("x", marginLeft)
    .attr("y", marginTop)
    .attr("width", width - marginLeft - marginRight)
    .attr("height", height - marginTop - marginBottom)
    .attr("preserveAspectRatio", "none")
    .attr("xlink:href", ramp(color.interpolator()).toDataURL());

  svg.append("g")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(d3.axisBottom(x)
      .ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
      .tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
      .tickSize(tickSize)
      .tickValues(tickValues))
    .call(tickAdjust)
    .call(g => g.select(".domain").remove())
    .call(g => g.append("text")
      .attr("x", marginLeft)
      .attr("y", marginTop + marginBottom - height - 6)
      .attr("fill", "currentColor")
      .attr("text-anchor", "start")
      .attr("font-weight", "bold")
      .attr("class", "title is-7")
      .text(title));

  return svg.node();
}

function ramp(color, n = 256) {
  var canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  for (let i = 0; i < n; ++i) {
    context.fillStyle = color(i / (n - 1));
    context.fillRect(i, 0, 1, 1);
  }
  return canvas;
}

