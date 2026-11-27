local ADDON_NAME = ...

local DATA            -- ForeverAHHistory_Data, set on login
local db              -- ForeverAHHistoryDB
local houseKey        -- key into DATA.houses: a house id or "all"
local seriesCache = {}

local GRAPH_WIDTH, GRAPH_HEIGHT = 360, 140

local function say(fmt, ...)
	print("|cffe6c34dForeverAH|r: " .. format(fmt, ...))
end

local function formatMoney(copper)
	copper = math.floor(copper + 0.5)
	if GetCoinTextureString then
		return GetCoinTextureString(copper)
	end
	local gold, silver, cop = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
	if gold > 0 then return format("%dg %ds %dc", gold, silver, cop) end
	if silver > 0 then return format("%ds %dc", silver, cop) end
	return format("%dc", cop)
end

-- "120,,130" -> { 120, nil, 130 }, 3. Empty fields are days without listings.
local function parseSeries(raw)
	local values, n = {}, 0
	for field in (raw .. ","):gmatch("([^,]*),") do
		n = n + 1
		values[n] = tonumber(field)
	end
	return values, n
end

local function getSeries(itemId)
	local house = DATA and houseKey and DATA.houses[houseKey]
	local raw = house and house.items[itemId]
	if not raw then return nil end
	local key = tostring(houseKey) .. ":" .. itemId
	local entry = seriesCache[key]
	if not entry then
		local values, n = parseSeries(raw)
		entry = { values = values, n = n }
		seriesCache[key] = entry
	end
	return entry
end

local function average(entry, fromIndex)
	local sum, count = 0, 0
	for i = math.max(fromIndex, 1), entry.n do
		local v = entry.values[i]
		if v then
			sum, count = sum + v, count + 1
		end
	end
	if count == 0 then return nil end
	return sum / count
end

local function latest(entry)
	for i = entry.n, 1, -1 do
		if entry.values[i] then return entry.values[i], i end
	end
end

local function addTooltipLines(tooltip, itemId)
	if not itemId or not tooltip.AddDoubleLine then return end
	local entry = getSeries(itemId)
	if not entry then return end
	local last, lastIndex = latest(entry)
	if not last then return end

	local avg7, avgAll = average(entry, entry.n - 6), average(entry, 1)
	tooltip:AddDoubleLine("AH median " .. DATA.days[lastIndex], formatMoney(last), 0.9, 0.76, 0.3, 1, 1, 1)
	if avg7 then
		tooltip:AddDoubleLine("AH 7-day average", formatMoney(avg7), 0.9, 0.76, 0.3, 1, 1, 1)
	end
	tooltip:AddDoubleLine(format("AH %d-day average", entry.n), formatMoney(avgAll), 0.9, 0.76, 0.3, 1, 1, 1)
end

local function hookTooltips()
	if TooltipDataProcessor and Enum and Enum.TooltipDataType then
		TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
			addTooltipLines(tooltip, data and data.id)
		end)
		return
	end
	local function onTooltipSetItem(tooltip)
		local _, link = tooltip:GetItem()
		addTooltipLines(tooltip, link and tonumber(link:match("item:(%d+)")))
	end
	for _, tooltip in ipairs({ GameTooltip, ItemRefTooltip, ShoppingTooltip1, ShoppingTooltip2 }) do
		if tooltip then tooltip:HookScript("OnTooltipSetItem", onTooltipSetItem) end
	end
end

-- Matches a house whose name contains both the realm and the faction. The
-- API's house names are not confirmed yet, so "all" is the fallback.
local function detectHouse()
	local realm = (GetRealmName() or ""):lower()
	local faction = (UnitFactionGroup("player") or ""):lower()
	if realm ~= "" and faction ~= "" then
		for key, house in pairs(DATA.houses) do
			local name = (house.name or ""):lower()
			if key ~= "all" and name:find(realm, 1, true) and name:find(faction, 1, true) then
				return key
			end
		end
	end
	return "all"
end

local function sortedHouses()
	local list = {}
	for key, house in pairs(DATA.houses) do
		list[#list + 1] = { key = key, name = house.name or tostring(key) }
	end
	table.sort(list, function(a, b) return a.name < b.name end)
	return list
end

local graph

local function createGraph()
	local f = CreateFrame("Frame", "ForeverAHHistoryGraph", UIParent, "BasicFrameTemplateWithInset")
	f:SetSize(GRAPH_WIDTH + 40, GRAPH_HEIGHT + 90)
	f:SetPoint("CENTER")
	f:SetFrameStrata("DIALOG")
	f:SetMovable(true)
	f:EnableMouse(true)
	f:RegisterForDrag("LeftButton")
	f:SetScript("OnDragStart", f.StartMoving)
	f:SetScript("OnDragStop", f.StopMovingOrSizing)
	table.insert(UISpecialFrames, "ForeverAHHistoryGraph")

	f.title = f:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
	f.title:SetPoint("TOP", 0, -5)
	f.maxLabel = f:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	f.maxLabel:SetPoint("TOPLEFT", 20, -32)
	f.firstLabel = f:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
	f.firstLabel:SetPoint("BOTTOMLEFT", 20, 16)
	f.lastLabel = f:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
	f.lastLabel:SetPoint("BOTTOMRIGHT", -20, 16)
	f.bars = {}
	return f
end

local function onBarEnter(bar)
	GameTooltip:SetOwner(bar, "ANCHOR_TOP")
	GameTooltip:AddLine(bar.day)
	GameTooltip:AddLine(bar.value and formatMoney(bar.value) or "No listings", 1, 1, 1)
	GameTooltip:Show()
end

local function showGraph(itemId)
	local entry = getSeries(itemId)
	if not entry or not latest(entry) then
		say("No price history for item %d in %s.", itemId, DATA.houses[houseKey].name)
		return
	end
	graph = graph or createGraph()

	local maxValue = 0
	for i = 1, entry.n do
		local v = entry.values[i]
		if v and v > maxValue then maxValue = v end
	end

	local slot = GRAPH_WIDTH / entry.n
	for i = 1, entry.n do
		local bar = graph.bars[i]
		if not bar then
			bar = CreateFrame("Frame", nil, graph)
			bar.texture = bar:CreateTexture(nil, "ARTWORK")
			bar.texture:SetAllPoints()
			bar:EnableMouse(true)
			bar:SetScript("OnEnter", onBarEnter)
			bar:SetScript("OnLeave", GameTooltip_Hide)
			graph.bars[i] = bar
		end
		local v = entry.values[i]
		bar.day, bar.value = DATA.days[i], v
		bar:ClearAllPoints()
		bar:SetPoint("BOTTOMLEFT", graph, "BOTTOMLEFT", 20 + (i - 1) * slot, 36)
		bar:SetSize(math.max(slot - 2, 1), v and math.max(GRAPH_HEIGHT * v / maxValue, 1) or 2)
		if v then
			bar.texture:SetColorTexture(0.9, 0.76, 0.3, 0.9)
		else
			bar.texture:SetColorTexture(0.4, 0.4, 0.4, 0.6)
		end
		bar:Show()
	end
	for i = entry.n + 1, #graph.bars do
		graph.bars[i]:Hide()
	end

	graph.title:SetText((GetItemInfo(itemId) or ("Item " .. itemId)) .. " - " .. DATA.houses[houseKey].name)
	graph.maxLabel:SetText("Max " .. formatMoney(maxValue))
	graph.firstLabel:SetText(DATA.days[1])
	graph.lastLabel:SetText(DATA.days[entry.n])
	graph:Show()
end

local function handleHouseCommand(arg)
	local list = sortedHouses()
	if arg == "" then
		for i, house in ipairs(list) do
			say("%d. %s%s", i, house.name, house.key == houseKey and " (active)" or "")
		end
		say("/fah house <number> selects a house, /fah house auto detects it.")
	elseif arg == "auto" then
		db.house = nil
		houseKey = detectHouse()
		say("Using %s.", DATA.houses[houseKey].name)
	else
		local choice = list[tonumber(arg) or 0]
		if not choice then
			say("No house number %s. Type /fah house to list them.", arg)
			return
		end
		db.house = choice.key
		houseKey = choice.key
		say("Using %s.", choice.name)
	end
end

SLASH_FOREVERAHHISTORY1 = "/fah"
SlashCmdList.FOREVERAHHISTORY = function(msg)
	msg = strtrim(msg or "")
	if not DATA then
		say("This build contains no price data.")
		return
	end
	local cmd, arg = msg:match("^(%S*)%s*(.-)$")
	if cmd:lower() == "house" then
		handleHouseCommand(arg)
		return
	end
	local itemId = tonumber(msg:match("item:(%d+)") or msg:match("^(%d+)$"))
	if itemId then
		showGraph(itemId)
		return
	end
	say("Data %s to %s, house: %s.", DATA.days[1], DATA.days[#DATA.days], DATA.houses[houseKey].name)
	say("/fah <item link or id> shows a price graph. /fah house lists auction houses.")
end

local events = CreateFrame("Frame")
events:RegisterEvent("PLAYER_LOGIN")
events:SetScript("OnEvent", function()
	ForeverAHHistoryDB = ForeverAHHistoryDB or {}
	db = ForeverAHHistoryDB
	DATA = ForeverAHHistory_Data
	if not DATA or not DATA.houses then
		say("No price data loaded. Update the addon to get the latest release.")
		return
	end
	if db.house ~= nil and DATA.houses[db.house] then
		houseKey = db.house
	else
		houseKey = detectHouse()
	end
	hookTooltips()
end)
